import { XMLParser } from 'fast-xml-parser';
import type { AdaptationSet, ParsedMpd } from './types.js';

export class MpdParser {
  private readonly xmlParser = new XMLParser({ ignoreAttributes: false });

  parse(xml: string): ParsedMpd {
    return this.xmlParser.parse(xml) as ParsedMpd;
  }

  extractPublishTime(parsed: ParsedMpd): string | null {
    return parsed.MPD?.['@_publishTime'] ?? null;
  }

  extractMinimumUpdatePeriod(parsed: ParsedMpd): string | null {
    return parsed.MPD?.['@_minimumUpdatePeriod'] ?? null;
  }

  extractAdaptationSets(parsed: ParsedMpd): AdaptationSet[] {
    const adaptationSet = parsed.MPD?.Period?.AdaptationSet;
    if (!adaptationSet) return [];
    return Array.isArray(adaptationSet) ? adaptationSet : [adaptationSet];
  }
}
