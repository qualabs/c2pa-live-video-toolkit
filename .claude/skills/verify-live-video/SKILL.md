---
name: verify-live-video
description: Full verification runbook for C2PA Live Video (spec §19) work in this toolkit: standalone signing and validation with the bundled c2patool (trust-list matrix, tamper detection, JSON report and exit codes), the same flows through the live pipeline and the browser player, the JS test suites, and conformance checked against the published C2PA specification. Use before pushing, before responding to review, or whenever asked to "verify everything".
---

# Verify C2PA Live Video end to end

This runbook verifies the signer/player pipeline in this repo and the `c2patool`
binary it ships. Building that binary is the SDK repo's business; here it is an input.

Run the stages in order. **Never push unless explicitly asked.**

## Paths

Two exports, derived from wherever the repo is checked out, so they hold for anyone:

```bash
export TOOLKIT=$(git rev-parse --show-toplevel)         # run this from inside the repo
export C2PATOOL=$TOOLKIT/packages/signer/bin/c2patool   # the binary under test
```

Anything a stage produces (signed fixtures, extracted spec text, PR bodies) goes in a
throwaway directory under `/tmp`, created by the stage that needs it. Nothing is kept
between runs: a leftover scratch directory is how a stale binary and last week's
segments get read as this run's result.

## Standing rule: every mistake becomes a check here

When a step of this runbook is wrong, or a claim you made turns out to be false, fix
this file in the same turn, before moving on. Not the finding, the cause: the command
that lied, the assumption that was never measured, the check that was missing. Then say
in the report what changed and why.

Everything in the "traps" list below arrived that way, each from a real wrong answer
given in this project. The list is the point of the document; the commands are just
scaffolding around it.

**Run the commands as written here, and run the stages in order.** Twice in one session
the failure was not a missing check but a documented one that went unused: the CLI
validation was run against a pipeline that had never been rebuilt, and a trap spelled
out two paragraphs further down was walked into anyway, because the stage had been read
rather than executed.

---

## Precondition: the binary under test

Every stage here judges a **binary**, `packages/signer/bin/c2patool`, not a source tree.
It is checked into this repo, it is what the signer image bakes in, and it is never in
a diff, so nothing you review shows its age. A stale one turns the whole run into a
measurement of last week's code and nothing in the output says so. Once here, the
checked-in binary was two weeks behind the change under test, and every stage would
have measured code that no longer existed.

```bash
$C2PATOOL --version
ls -l --time-style=+%F\ %T $C2PATOOL

# It has to run in the signer image, which is node:22-slim (Debian bookworm, GLIBC
# 2.36). A build made on a newer host links against symbols that image does not have.
objdump -T $C2PATOOL | grep -o 'GLIBC_[0-9.]*' | sort -uV | tail -1   # must be <= 2.36
```

Confirm that version is the build you mean to test before reading any result.

That `objdump` line is not academic. A host-built `c2patool` on Ubuntu 24.04 requires
`GLIBC_2.39`, installs cleanly, passes every stage that runs on the host, and then dies
at exec inside the container with `error while loading shared libraries` while every
service still reports `running` and the signer produces nothing. The binary currently in
the repo requires `GLIBC_2.30`, which is why it works. Check this before installing a
binary, not after a pipeline run comes back empty. It is
built from the `c2patool` crate with `--features unstable_live_video`, inside a
`rust:slim-bookworm` container so its GLIBC matches the signer image, and copied here.
Two traps in that build, if you ever redo it:

- **Never "fix" the OpenSSL build with `OPENSSL_NO_VENDOR=1`.** It looks right, since
  `pkg-config` reports a perfectly good system OpenSSL and the build gets three times
  faster. But it links `libssl` dynamically, and the signer's runtime image has no
  `libssl.so.3`, so the binary dies at exec with `error while loading shared libraries`
  while every container still reports `running`. The vendored build is what makes it
  static. Smoke-test it in the runtime image before trusting anything downstream:
  `docker run --rm -v $C2PATOOL:/c2patool node:22-slim /c2patool --version`. Without
  Docker on the machine you are on, the `objdump` check above is the substitute, and
  building a container-compatible binary is not possible at all: say so rather than
  installing a host build.
- **The vendored OpenSSL needs `perl`, `make` and `build-essential`.** `./Configure`
  wants `FindBin.pm`, which `rust:slim-bookworm` omits, and the failure surfaces
  minutes later as an unrelated-looking OpenSSL error.

The same staleness applies downstream: the signer container carries its own copy, and
the player resolves `@svta/cml-c2pa` through `node_modules` plus a Vite prebundle in
`packages/*/node_modules/.vite/`. Editing CML source without rebuilding its `dist` and
clearing those caches leaves the browser running the old validator.

---

## Stage 1: CLI validation matrix on local fixtures

Faster than the pipeline and covers cases the pipeline cannot reach. Run it before
stage 2: if the matrix is wrong, the pipeline result means nothing.

Run `spec-check.sh` first, once per method. It does everything this stage describes
by hand (sign with `c2patool` alone, tamper a copy, validate across the trust-list
matrix) and asserts each normative rule separately, printing the spec section and the
rule text next to its verdict. It exits non-zero if any rule fails:

```bash
$TOOLKIT/.claude/skills/verify-live-video/spec-check.sh --method manifest
$TOOLKIT/.claude/skills/verify-live-video/spec-check.sh --method vsi
```

Both methods must end in `17 passed, 0 failed`. Treat any failure, and any change in
those counts, as a regression. Rule A2 runs for VSI only: §19.3 does not enforce the
init-segment binding at all, which is an open SDK gap described under stage 8, not
something this repo can regress. It takes no arguments beyond the method
because everything it needs is in this repo: it runs
`packages/signer/bin/c2patool`, the release binary this repo ships and the signer
image bakes in, signs with `packages/signer/sample-certs/ps256.*`, and uses the CMAF
fixtures in `packages/attack-proxy/ad-insertion/ads/`. Trust anchors are derived from
that same certificate chain on each run, so there is no trust file to keep up to date.
Add `--keep` to inspect the signed and tampered artifacts.

If the installed binary predates the JSON report, the script says so and stops with
exit 2 rather than failing every rule for the same reason. That is not a script
problem: the checked-in binary predates the report. Rebuild and reinstall it, then
re-run. As of this writing `main` ships c2patool 0.26.33, which stops here.

The rule text in that script is quoted from the spec on purpose: when a new revision
changes a requirement, the diff points straight at the check that has to move. A rule
that cannot be expressed there stays as prose below.

Rules A1 and A2 cover ABR: `ffmpeg` re-encodes the fixtures into a second
representation at 640x360 / 300k, each rendition is signed on its own, and the segments
of one are then validated under the other's init segment. Without `ffmpeg` on the
machine both rules print `SKIP` rather than passing silently.

Do not treat a green `spec-check.sh` as covering the rest of the stage. It runs on
three consecutive segments and one synthetic rendition switch; a real ABR ladder, the
pipeline's own signer and the browser validator are still stages 2 to 6.


Synthetic `moof`/`mdat` boxes **cannot** be signed (the BMFF hash needs the real
structure tied to the init segment), so start from real fMP4. This repo ships a set in
`packages/attack-proxy/ad-insertion/ads/`: `init-stream0.m4s` plus the consecutive
`chunk-stream0-00101..103.m4s`.

### Sign a stream without the toolkit

Everything below runs on `c2patool` alone. Do not reach for the pipeline to produce
test material: it is slower, it couples the check to Docker, and a stale signer there
produces segments that no longer match the code under test.

```bash
cd "$(mktemp -d /tmp/live-video-check.XXXXXX)"
G="chunk-stream0-*.m4s"
B=$TOOLKIT/packages/attack-proxy/ad-insertion/ads

# The segments must be CONSECUTIVE. `live-video-sign --method vsi` refuses to sign a
# segment whose own moof/mfhd.sequence_number differs from its running counter
# (vsi_signing.rs, the sequence-drift guard), so a gappy set signs the first segment
# and fails the rest.
mkdir -p src-unsigned && cp $B/init-stream0.m4s src-unsigned/init.mp4
cp $B/chunk-stream0-0010*.m4s src-unsigned/

# Manifest for §19.3. The `c2pa.livevideo.segment` assertion with a streamId is
# required; the signer fills in previousManifestId and sequenceNumber per segment.
cat > manifest-psm.json <<'EOF'
{
  "alg": "ps256",
  "private_key": "$TOOLKIT/packages/signer/sample-certs/ps256.pem",
  "sign_cert": "$TOOLKIT/packages/signer/sample-certs/ps256.pub",
  "assertions": [
    { "label": "c2pa.actions", "data": { "actions": [
      { "action": "c2pa.created",
        "digitalSourceType": "http://c2pa.org/digitalsourcetype/empty" } ] } },
    { "label": "c2pa.livevideo.segment", "data": {
      "sequenceNumber": 1, "streamId": "s0", "continuityMethod": "c2pa.manifestId" } }
  ]
}
EOF
# For §19.4 the livevideo.segment assertion is omitted: VSI carries that data in the emsg.
cat > manifest-vsi.json <<'EOF'
{
  "alg": "ps256",
  "private_key": "$TOOLKIT/packages/signer/sample-certs/ps256.pem",
  "sign_cert": "$TOOLKIT/packages/signer/sample-certs/ps256.pub",
  "assertions": [
    { "label": "c2pa.actions", "data": { "actions": [
      { "action": "c2pa.created",
        "digitalSourceType": "http://c2pa.org/digitalsourcetype/empty" } ] } }
  ]
}
EOF

mkdir -p psm vsi && head -c 32 /dev/urandom > session.key

$C2PATOOL src-unsigned live-video-sign --method manifest \
  --segments_glob "$G" --init init.mp4 \
  --manifest manifest-psm.json --output psm

$C2PATOOL src-unsigned live-video-sign --method vsi \
  --segments_glob "$G" --init init.mp4 \
  --manifest manifest-vsi.json --session-key session.key --output vsi

# Tampered copy for the negative case
cp -r psm psm-tampered
python3 - <<'EOF'
import pathlib
p = sorted(pathlib.Path('psm-tampered').glob('*.m4s'))[1]
b = bytearray(p.read_bytes()); b[b.find(b'mdat') + 100] ^= 0xFF; p.write_bytes(bytes(b))
EOF
```

Check the signed output before validating it. A signer that silently wrote
`previousManifestId` as an `xmp:iid:` instance ID rather than the manifest label
(`urn:c2pa:`) produced segments that chained to nothing, and the bug survived for
weeks because validation was only ever run on freshly signed material:

```bash
$C2PATOOL psm/chunk-stream0-00102.m4s 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin); m = d['manifests'][d['active_manifest']]
seg = [a for a in m['assertions'] if 'livevideo' in a['label']][0]['data']
print('label      ', d['active_manifest'])
print('prevManifest', seg.get('previousManifestId'))   # must be urn:c2pa:, never xmp:iid:
"
```

### Validate


| # | Command | Expected `validation_state` |
|---|---|---|
| 1 | `$C2PATOOL psm/init.mp4 live-video --segments_glob "$G"` | `Valid` |
| 2 | `$C2PATOOL vsi/init.mp4 live-video --segments_glob "$G"` | `Valid` |
| 3 | `$C2PATOOL --settings trust-ok.toml psm/init.mp4 live-video --segments_glob "$G"` | `Trusted` |
| 4 | `$C2PATOOL --settings trust-alien.toml psm/init.mp4 live-video --segments_glob "$G"` | `Invalid`, `signingCredential.untrusted` |
| 5 | `$C2PATOOL psm-tampered/init.mp4 live-video --segments_glob "$G"` | `Invalid`, `assertion.bmffHash.mismatch` |

`trust-ok.toml` and `trust-alien.toml` are the two settings files `spec-check.sh`
generates: run it once with `--keep` and copy them out of its work directory, or build
them by hand as described at the end of this stage.

Run 3, 4 and 5 for **both** methods, not just §19.3. The failure codes differ:
§19.3 reports the hash mismatch through `livevideo.manifest.invalid`, §19.4 through
`livevideo.segment.invalid`, because VSI carries the hash in the `emsg` rather than
in a per-segment manifest.

Cases 1 and 2 are the regression that matters: the SDK's X.509 trust lists are empty
by default, so a correctly signed stream reads as `Valid` with a
`signingCredential.untrusted` failure. Requiring `Trusted` rejects every conforming
stream out of the box, which §19.7.1 does not ask for.

Three properties to assert beyond the state:

```bash
# stdout alone must be parseable JSON (progress goes to stderr)
$C2PATOOL psm/init.mp4 live-video --segments_glob "$G" 2>/dev/null | python3 -m json.tool >/dev/null

# exit code follows the state
$C2PATOOL psm/init.mp4          live-video --segments_glob "$G" >/dev/null 2>&1; echo "$?"   # 0
$C2PATOOL psm-tampered/init.mp4 live-video --segments_glob "$G" >/dev/null 2>&1; echo "$?"   # non-zero

# the live-video report must agree with the ordinary read path on the same file
$C2PATOOL --settings trust-ok.toml psm/chunk-stream0-00102.m4s 2>/dev/null \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['validation_state'])"
```

That last one caught a real bug: the report hard-coded Valid/Invalid, so a stream
whose signer did chain to an anchor reported `Valid` while the ordinary read of the
same segment reported `Trusted`.

Cover the `Trusted` case, not just accept and reject. It is the one state that needs
real trust material, so it is the one most often left untested, and the report collapsed
it to `Valid` for a while with nothing catching that. Verify it both ways:

```bash
# 1. Through the CLI, with anchors that do chain
$C2PATOOL --settings trust-ok.toml psm/init.mp4 live-video --segments_glob "$G" \
  2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin)['validation_state'])"
# expect Trusted, and the same value from an ordinary read of one signed segment

# 2. Through a sidecar, which is how an operator actually supplies anchors
mkdir -p /tmp/sc && cp anchors.pem /tmp/sc/c2pa-trust-list.pem
cp store.cfg /tmp/sc/c2pa-trust-store.cfg
$C2PATOOL --settings /tmp/sc/c2pa.toml psm/init.mp4 live-video --segments_glob "$G" \
  2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin)['validation_state'])"
rm -rf /tmp/sc
```

**Trust material reaches `live-video` through sidecar files, not through the `trust`
sub-command's flags.** `trust` and `live-video` are sibling clap sub-commands and are
mutually exclusive, so `--trust_anchors` cannot be combined with `live-video`. But
`apply_trust_sidecars` runs unconditionally, before the sub-command is matched, so
dropping a PEM next to `--settings` works for any command and needs no inline TOML:

```bash
cp my-anchors.pem  /tmp/sc/c2pa-trust-list.pem     # the settings file itself need not exist
cp store.cfg       /tmp/sc/c2pa-trust-store.cfg
$C2PATOOL --settings /tmp/sc/c2pa.toml psm/init.mp4 live-video --segments_glob "$G"
```

Prefer this to embedding PEM in a settings document. Both work; only one is readable.
To build a negative case, generate an unrelated self-signed CA rather than reusing
the signer's own chain, which the validator will happily accept as an anchor:

```bash
openssl req -x509 -newkey rsa:2048 -keyout /tmp/alien.key -out /tmp/alien.pem \
  -days 3650 -nodes -subj '/CN=Alien Root CA'
```

Note when writing tests against this: `Settings` validates PEM material on
construction, so a fake or empty anchor string cannot be built at all.

---

## Stage 2: Live pipeline, run once per method

Do this **twice**: `USE_VSI_METHOD=false` (§19.3 ManifestBox) and `true` (§19.4 VSI).

The signer runs the binary **baked into its image**, not one mounted from the host:
`packages/signer/Dockerfile` does `COPY packages/signer/bin/c2patool
/usr/local/bin/c2patool`, and the `signer` service in `docker-compose.yml` mounts only
`stream-data`, the certs and the sample manifests. So a container that is already up is
running whatever binary was current when its image was built, and bringing the stack up
without `--build` reuses that image. The `cp` into `packages/signer/bin/` is what
invalidates the `COPY` layer; without it, `--build` changes nothing.

Confirm both halves before believing a pipeline result, since a stale signer produces
segments that no longer match the code under test:

```bash
cd $TOOLKIT
md5sum packages/signer/bin/c2patool /tmp/c2pa-docker-target/release/c2patool  # must match
```

`docker compose down -v` deletes the `stream-data` volume, and with it every segment the
previous run produced. Copy anything you still want to inspect out first:

```bash
docker compose cp signer:/host_stream/processed/output /tmp/prev-run-output
```

```bash
cd $TOOLKIT
sed -i 's/USE_VSI_METHOD=.*/USE_VSI_METHOD=false/' .env    # or true

docker compose down -v
docker compose up --build -d

# The image must carry the binary you just built, not a cached layer.
docker compose exec signer md5sum /usr/local/bin/c2patool

# Wait for real output, then check the signer logged no failures.
until [ "$(docker compose exec signer sh -c \
  'ls /host_stream/processed/output/chunk-stream0-*.m4s 2>/dev/null | wc -l')" -ge 12 ]; do
  sleep 4
done
docker compose logs signer 2>&1 | grep -iE "error|fail|panic" | grep -v "Error fetching MPD"
```

`[ManifestBox] Signed in ...` / `[VSI] Signed in ...` lines with no errors is the
pass condition for signing.

---

## Stage 3: Validate the signed stream with the CLI

**Precondition: stage 2 ran in this session.** Never validate a pipeline that was already
up. It is the easiest stage to skip, because the containers say `running` and produce
output that looks fine, and the result is then a measurement of whichever binary the image
was built with and of segments left over from an earlier run. Skipping it here produced a
report of `Trusted` on every representation while the signer had been wedged for hours.

```bash
docker compose ps --format '{{.Name}} {{.RunningFor}}'   # minutes, not hours
docker compose exec signer md5sum /usr/local/bin/c2patool
md5sum $C2PATOOL                                # must match the line above
```

If the durations are long or the checksums differ, go back to stage 2 and rebuild instead
of reading anything into what follows.


The sample certs are not on a default trust list, so supply the trust anchors,
otherwise everything fails as `signingCredential.untrusted` and the run tells you
nothing about live-video logic:

```bash
mkdir -p /tmp/tk && cd /tmp/tk
python3 - <<'EOF'
pem = open('$TOOLKIT/packages/signer/sample-certs/ps256.pub').read()
open('settings.toml','w').write(f'[trust]\ntrust_anchors = """\n{pem}"""\n')
EOF

cd $TOOLKIT
docker compose cp signer:/host_stream/processed/output /tmp/tk/

cd /tmp/tk
# All five representations, not just one, because ABR switching is where bugs hide.
for s in 0 1 2 3 4; do
  printf "stream%s: " "$s"
  $C2PATOOL --settings settings.toml \
    output/init-stream$s.m4s live-video --segments_glob "chunk-stream${s}-*.m4s" 2>&1 | tail -1
done
```

**A stream with no segments reports `Trusted` and passes vacuously.** Assert a segment
count, not just the state, or an empty output directory reads as a clean run:

```bash
$C2PATOOL --settings settings.toml output/init-stream0.m4s live-video \
  --segments_glob "chunk-stream0-*.m4s" 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin); n = len(d['segments'])
assert n >= 20, f'only {n} segments: the pipeline is not producing, the result is meaningless'
print(d['validation_state'], n)"
```

Check the pipeline is actually alive before reading anything into its output. It can sit
in `running` while signing nothing:

```bash
docker compose exec -T signer sh -c 'ls /host_stream/processed/output | wc -l'   # twice, 30s apart
docker compose logs signer 2>&1 | grep -c "signing failed"
docker compose logs signer 2>&1 | grep -oE 'chunk-stream[0-9]-[0-9]+\.m4s"\]: Failed' \
  | sed 's/.*-\([0-9]*\)\.m4s.*/\1/' | sort -u        # all one number = wedged, not flaky
```

Seen here: the signer retried a single segment 858 times because the DASH streamer's
retention window had already deleted the input file it was told to sign. The counter
never advanced, the output directory stayed at 9 files, and every stream still reported
`Trusted` on its one remaining segment.

Expect `N segment(s) validated successfully.` on every stream. The method line
should read `19.3 (per-segment C2PA Manifest Box)` or `19.4 (Verifiable Segment
Info)` matching the `.env` you set.

---

## Stage 4: Tamper detection (the check that matters)

A validator that only ever says "valid" is worthless. Flip one byte inside a
signed segment's media payload and confirm rejection, **for both methods**:

```bash
cd /tmp/tk
python3 - <<'EOF'
p = 'output/chunk-stream0-00005.m4s'
d = bytearray(open(p,'rb').read())
i = len(d) - 200          # inside mdat, past the manifest/emsg
d[i] ^= 0xFF
open(p,'wb').write(d)
EOF

$C2PATOOL --settings settings.toml \
  output/init-stream0.m4s live-video --segments_glob "chunk-stream0-*.m4s"
```

Expected failure, by method:
- §19.3: `assertion.bmffHash.mismatch` on that segment, then
  `previousManifestId does not match` cascading through the following ones.
- §19.4: `segment bmffHash verification failed: ... BMFF file level hash mismatch`.

Exit code must be non-zero. If it still reports success, stop: the trust/validation
path is broken regardless of what the other stages said.

---

## Stage 5: Browser playback (independent validator)

The player validates with `@svta/cml-c2pa`, a separate implementation that parses
the CBOR itself. Agreement between it and the Rust CLI is much stronger evidence
than either alone.

```bash
cd $TOOLKIT/packages/player-demo && npm run dev   # port 3008
```

```javascript
// Needs playwright; symlink the global install into a scratch node_modules if absent.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(), p = await b.newPage();
  await p.goto('http://localhost:3008/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(30000);                       // let ABR switch renditions
  const t = await p.evaluate(() => document.body.innerText);
  console.log(t.match(/✓ \d+[\s\S]{0,10}✗ \d+[\s\S]{0,10}⚠ \d+/)?.[0]);
  console.log(await p.evaluate(() => [...document.querySelectorAll('table tr')]
    .map(r => r.innerText.replace(/\n/g, ' | ')).slice(0, 12)));
  await p.screenshot({ path: '/tmp/player.png', fullPage: true });
  await b.close();
})();
```

Expect `✗ 0`, the INIT row VALID, and media rows VALID across several qualities.

**Known discrepancy:** the JS validator has shown sustained NOT VALID on §19.3
after an ABR switch to a low rendition, for segments the CLI validates as Trusted.
If that appears, extract those exact segments and validate them with the CLI
before blaming the Rust side, since it localizes the bug to the TypeScript validator.

---

## Stage 6: Interop against a third-party stream

Everything up to here validates streams this repo signed, with validators this repo
ships. That closes the loop on itself: a shared wrong assumption between our signer and
our validator passes every stage. Point the player at a stream signed by someone else.

Unified Streaming publishes one at
<https://live.unified-streaming.com/trusted_media/wdr.ism/.mpd>. It is §19.4 (VSI):
session keys in the init segment, a `urn:c2pa:verifiable-segment-info` emsg per segment.

The demo takes any URL, through the input bar or a `?url=` query parameter, so no code
change is needed:

```bash
cd $TOOLKIT/packages/player-demo && npm run dev   # port 3008
```

```javascript
const { chromium } = require('playwright');
const U = 'https://live.unified-streaming.com/trusted_media/wdr.ism/.mpd';
(async () => {
  const b = await chromium.launch(), p = await b.newPage();
  await p.goto('http://localhost:3008/dashjs-native?url=' + encodeURIComponent(U),
               { waitUntil: 'networkidle' });
  await p.waitForTimeout(25000);
  const rows = await p.evaluate(() => [...document.querySelectorAll('table tr')]
    .map(r => r.innerText.replace(/\n/g, ' | ')));
  console.log(rows.filter(r => !/\| OK$/.test(r)).slice(0, 6));
})();
```

CML validates it: INIT `VALID` with session keys, media rows `VALID`, `✗ 0`. A
`MISSING SEGMENT` warning on an occasional audio segment is a network gap on a public
live endpoint, not a signature failure; distinguish the two before reporting either.

**The two validators disagree on this stream, and the spec settles it.** `c2patool`
rejects the same init segment outright:

```bash
curl -s -o /tmp/us-init.mp4 \
  'https://live.unified-streaming.com/trusted_media/wdr.ism/dash/wdr-video=762993.dash'
$C2PATOOL /tmp/us-init.mp4 live-video --segments_glob 'nothing-*.m4s' 2>&1 | tail -3
# livevideo.manifest.invalid: init segment manifest did not validate:
#   assertion.action.malformed: c2pa.created action must have a digitalSourceType
```

Check the clause rather than assuming the stricter side is right. Here it is, and it is
a `shall`, so the stream is the non-conforming one and `c2patool` is correct:

```bash
grep -n 'shall be recorded with the c2pa.created action' "$SPEC_TXT"
# "For all assets, a corresponding digitalSourceType field, with an appropriate value,
#  shall be recorded with the c2pa.created action, to indicate the nature of the asset
#  at its inception."
```

So CML accepts a manifest the specification requires to be rejected. Record that as a
finding about the JS validator, not about the stream, and do not "fix" our signer to
match the lenient side: this repo already sets `digitalSourceType` deliberately.

---

## Stage 7: Toolkit JS tests

```bash
cd $TOOLKIT
for p in c2pa-player-core dashjs-plugin hlsjs-plugin videojs-ui; do
  (cd packages/$p && npm run test)
done
```

`hlsjs-plugin` prints an expected `RangeError` to stderr from a deliberate
malformed-init test; the run still passes.

---

## Stage 8: spec conformance against the published specification

The normative source is the specification published at
<https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html>,
not memory and not a local copy that may have gone stale.

First confirm 2.4 is still the current version. `https://spec.c2pa.org/specifications/`
redirects to whatever the latest one is, so the canonical link it returns names it:

```bash
curl -s https://spec.c2pa.org/specifications/ | grep -o 'specifications/[0-9.]*/index.html'
# specifications/2.4/index.html  -> 2.4 is current
```

If that prints a higher version, verify against **that** one instead: set `SPEC_VERSION`
below, re-read chapter 19, and record in the report that the spec moved and which
requirements changed. Do not mix a 2.4 reading with a newer normative text.

Fetch it once and work on the extracted text:

```bash
export SPEC_VERSION=2.4
export SPEC_TXT=/tmp/spec-$SPEC_VERSION.txt
curl -sL "https://spec.c2pa.org/specifications/specifications/$SPEC_VERSION/specs/C2PA_Specification.html" \
  | python3 -c "
import html, re, sys
s = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', sys.stdin.read(), flags=re.S)
sys.stdout.write(html.unescape(re.sub(r'<[^>]+>', '', s)))
" > "$SPEC_TXT"
grep -c . "$SPEC_TXT"   # a few thousand lines; an empty file means the fetch failed
```

Chapter 19 is Live Video: §19.1 introduction, §19.2 architecture, §19.3 the per-segment
Manifest Box method, §19.4 Verifiable Segment Info, §19.5 to §19.7 the architecture
diagram, the generation process and the validation process.

**Every heading appears twice in that file**, once in the table of contents and once in
the body, and the TOC copy comes first. A plain `sed -n '/^19\.7\.1\./,/^19\.7\.2\./p'`
therefore returns a two-line fragment of the TOC and nothing normative. Slice from the
*last* occurrence instead:

```bash
spec_section() {  # spec_section <start-regex> <end-regex>
  awk -v s="$1" -v e="$2" '
    $0 ~ s { last = NR } { l[NR] = $0 }
    END { for (i = last; i <= NR; i++) { print l[i]; if (i > last && l[i] ~ e) break } }
  ' "$SPEC_TXT"
}

spec_section '^19[.]7[.]1[.]' '^19[.]7[.]2[.]'   # the common validation steps
```

**Every spec sentence you paraphrase in a doc comment or a reply must exist.** A doc
comment here cited a §19.7.1 requirement for a manifest to be "cryptographically valid
and trusted"; that phrase appears nowhere in the specification. It was invented, and it
justified a wrong implementation for weeks.

```bash
grep -c "cryptographically valid and trusted" "$SPEC_TXT"   # 0: the phrase is fabricated
```

Checks that have found real conformance bugs:

```bash
# 1. Status codes: every livevideo.* code in the spec, against the ones the binary
#    carries. The two lists must be identical.
diff <(grep -oE 'livevideo\.[a-zA-Z]+\.invalid' "$SPEC_TXT" | sort -u) \
     <(strings -a $C2PATOOL | grep -oE 'livevideo\.[a-zA-Z]+\.invalid' | sort -u)
```

At 2.4 the spec names six: `livevideo.assertion.invalid`,
`livevideo.continuityMethod.invalid`, `livevideo.init.invalid`,
`livevideo.manifest.invalid`, `livevideo.segment.invalid` and
`livevideo.sessionkey.invalid`. Anchor the pattern on the `.invalid` suffix: a bare
`livevideo\.[a-zA-Z.]*` also matches the `c2pa.livevideo.segment` assertion label, and
in the binary it runs straight into whatever string follows it in the data section,
producing entries like `livevideo.init.invalidlivevideomanifest`.

§19.7.1 assigns them narrowly, and using a neighbouring code is a conformance bug even
though it "reports a failure" either way:

| Situation | Code |
|---|---|
| init segment contains an `mdat` box | `livevideo.init.invalid` |
| segment has neither a Manifest Box nor a qualifying `emsg` | `livevideo.segment.invalid` |
| a C2PA Manifest fails chapter 15 validation | `livevideo.manifest.invalid` |

`spec-check.sh` exercises all three (rules N1, N2 and V5): a stream with one unsigned
segment dropped back in, an init segment with an empty `mdat` appended, and a flipped
byte inside a `mdat`. Two open questions came out of building those cases, neither
settled here:

- **A dropped segment is caught under §19.3 and not under §19.4.** Removing a middle
  segment breaks the next one's `previousManifestId` chain and reports
  `livevideo.segment.invalid`; the same removal on a VSI stream validates as `Valid`
  with no failure at all. §19.4.2 says the sequence number "shall either match the
  `mfhd.sequence_number` [...] or shall follow the segment-indexing rules", which
  "provide for the sequence number to increase by 1 for each subsequent segment, while
  not decreasing or repeating", so the gap is visible in the `emsg` data. Whether the
  validator *shall* reject it is not stated.
- **The init segment is not bound to the media segments under §19.3.** Segments signed
  against one representation's init validate as `Valid` under a different
  representation's init, at another resolution and bitrate, and even under a completely
  unsigned init. §19.2.3 says the init segment "shall contain a uuid box, whose
  bmff-hash-map includes the moov box to establish a cryptographic relationship between
  the initialization segment and the media segments", and states the reason plainly:
  it "prevents replay attacks and content substitution". The uuid box is written, but
  nothing on the validation side checks it. §19.4 rejects the same substitution with
  `livevideo.segment.invalid`, so the two methods disagree about a normative binding.
  This is rule A2, which therefore runs for `--method vsi` only.

  The cause is an unanchored chain. `validate_manifest_id_continuity`
  (`sdk/src/live_video/segment_manifest_validation.rs`) returns early when there is no
  previous segment, so the first segment of a stream is never checked against anything,
  and the signer gives it nothing to check: `LiveVideoSigner` starts with
  `previous_manifest_id: None` and `sign_init_segment` discards the label it wrote.
  §19.4 avoids this with `expected_manifest_id` on the validator, seeded from the init's
  trusted manifest and compared per segment. The fix for §19.3 is the same shape: seed
  the chain from the init manifest on both sides, then re-enable A2 for both methods.
  Note that §19.3.2 defines `previousManifestId` as the *previous segment's* manifest
  and says nothing about the init, while §19.4.2 explicitly allows "the identifier of
  the manifest included in a previous segment (including an init segment)". The
  requirement in §19.2.3 is clear; the mechanism for §19.3 is not.
- **An unrecognized `continuityMethod` validates as `Valid`.** Signing with
  `"continuityMethod": "bogus.method"` produces a stream that passes, and
  `livevideo.continuityMethod.invalid` is never emitted. That is defensible, since
  §19.3.2 says "Implementers may define additional continuity methods", so unknown is
  not the same as invalid. But the player draws that distinction explicitly, and the
  two should be checked against each other rather than assumed to agree.

```bash
# 2. Normative verbs. shall != should, and the difference decides behaviour.
spec_section '^15[.]7[.] Validate the Signature' '^15[.]8[.]' | grep -n "shall\|should"
```

That distinction is the whole basis of the trust policy: verifying a chain of trust is a
`should`, so it may be skipped, but if it is performed and fails the claim `shall` be
rejected. Reading only the second half yields a validator that rejects every stream when
no trust list is configured.

```bash
# 3. Acceptance thresholds. Valid and Trusted are distinct states (§14.3.5, §14.3.6),
#    nested per §14.3.2, and §14.3.3 accepts an asset whose manifest is "either".
spec_section '^14[.]3[.]5[.] Valid Manifest' '^14[.]4[.]'
```

When a clause defers ("validated according to the general C2PA validation rules described
in Chapter 15"), follow the reference before implementing. The requirement lives at the
destination, and §19.7.1's bar turned out to be Valid, not Trusted.

Finally, confirm the identifiers the spec names are the ones the code compares.
§19.3.2's `previousManifestId` is the preceding segment's **C2PA Manifest identifier**,
which is the manifest label (`urn:c2pa:<uuid>`). It is not the claim's `instanceID`
(`xmp:iid:<uuid>`), a different value in a different namespace, per chapter 8.

---

## Reporting

State what was measured, not an impression:

> "spec-check 17/17 on both methods; 80/80 segments Trusted across 5 representations;
> tampering rejected with `assertion.bmffHash.mismatch`; 214 JS tests, 0 failures."

Call out explicitly:
- which stages were skipped and why,
- any failure you determined to be pre-existing, **with the baseline run that shows it**,
- anything you could not verify.

If a check was not run, say it was not run. A stage reported as passing because its
output was empty is worse than a stage reported as skipped.
