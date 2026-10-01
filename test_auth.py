import shlex
import requests
from pathlib import Path

CURL_FILE = Path("curl.txt")

text = CURL_FILE.read_text(encoding="utf-8")

# "Copy as cURL (bash)" använder ofta \ + radbrytning.
# Slå ihop det till ett enda kommando.
text = text.replace("\\\r\n", " ")
text = text.replace("\\\n", " ")

args = shlex.split(text)

url = None
headers = {}
cookies = None

i = 0
while i < len(args):
    arg = args[i]

    if arg == "curl":
        i += 1
        continue

    if arg in ("-H", "--header"):
        header = args[i + 1]
        key, value = header.split(":", 1)
        headers[key.strip()] = value.strip()
        i += 2
        continue

    if arg in ("-b", "--cookie"):
        cookies = args[i + 1]
        i += 2
        continue

    if arg.startswith("http://") or arg.startswith("https://"):
        url = arg

    i += 1

if not url:
    raise RuntimeError("Kunde inte hitta URL i curl.txt")

if cookies:
    headers["Cookie"] = cookies

print("Anropar:")
print(url)
print()

r = requests.get(
    url,
    headers=headers,
    timeout=60
)

print("HTTP-status:", r.status_code)
print()
print("Svar:")
print(r.text[:3000])