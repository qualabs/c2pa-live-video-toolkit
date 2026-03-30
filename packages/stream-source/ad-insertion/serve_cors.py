from http.server import HTTPServer, SimpleHTTPRequestHandler

class CORSRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

if __name__ == '__main__':
    import sys
    import os

    directory = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.chdir(directory)
    server_address = ('', 8000)
    httpd = HTTPServer(server_address, CORSRequestHandler)
    print(f"Serving DASH stream at http://localhost:8000/ from {directory}")
    httpd.serve_forever()
