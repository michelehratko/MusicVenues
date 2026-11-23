"""Batch-render the existing postcard tool without changing index.html."""
import csv
import json
import re
import subprocess
import tempfile
import threading
import time
import sys
import io
import math
import textwrap
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALTERNATE = '--contact-sheet-alternate' in sys.argv
OWNERSHIP = '--contact-sheet-ownership' in sys.argv
FULL_PRICE_ARTIST = '--full-price-artist' in sys.argv
PRICE_ARTIST = FULL_PRICE_ARTIST or '--contact-sheet-price-artist' in sys.argv
FINAL_SHEET = OWNERSHIP or PRICE_ARTIST
VERSION = 'V4' if ALTERNATE else 'V3' if '--contact-sheet-v3' in sys.argv else 'V2'
CONTACT_ONLY = not FULL_PRICE_ARTIST and (FINAL_SHEET or ALTERNATE or '--contact-sheet-v2' in sys.argv or '--contact-sheet-v3' in sys.argv)
MAKE_SHEET = CONTACT_ONLY or FULL_PRICE_ARTIST
OUT = ROOT / ('11/21' if FULL_PRICE_ARTIST else 'Final Postcards' if FINAL_SHEET else VERSION if CONTACT_ONLY else 'postcards-offset-gradient')
if '--output-dir' in sys.argv:
    OUT = Path(sys.argv[sys.argv.index('--output-dir') + 1]).resolve()
OUT.mkdir(parents=True, exist_ok=True)
rows = list(csv.reader((ROOT / 'data/Venue Research - just open venues + genre.csv').open()))[1:]
types = {'Music Club': 0, 'Nightclub': 1, 'Concert Hall / Theater': 2,
         'Classical Concert Hall': 2, 'Jazz Club': 0, 'Bar / Pub': 3,
         'Arena': 4, 'Cultural Space': 5, 'Cafe / Restaurant': 5, 'Outdoors': 6}
genres = re.findall(r"\['([^']+)', '#[0-9a-fA-F]{6}'\]",
                    (ROOT / 'index.html').read_text().split('const GENRES = [', 1)[1].split('];', 1)[0])
venues = []
for i, r in enumerate(rows):
    if not r[0].strip():
        continue
    notes = []
    def number(value, default, label):
        nums = re.findall(r'\d+(?:\.\d+)?', value.replace(',', ''))
        if not nums:
            notes.append(f'{label}: default {default}')
            return default
        return sum(map(float, nums)) / len(nums)
    cap = number(r[5], 300, 'capacity')
    years = number(r[11], 2026 - int(r[4]) if r[4].isdigit() else 40, 'years open')
    price = 0 if r[14].lower() == 'free' else 10 if r[14] == '<20' else number(r[14], 30, 'ticket price')
    addr = r[2].strip().rstrip(',')
    # The layout has three address slots; preserve all words in the last slot.
    words = addr.split()
    if len(words) > 3:
        addr = ' '.join(words[:2]) + ' ' + '\u00a0'.join(words[2:])
    if not addr:
        notes.append('address missing in source; address slots left blank')
    gs = [genres.index(g.strip().lower()) for g in r[6].split(',') if g.strip().lower() in genres]
    if not gs:
        gs = [4]
        notes.append('genre missing: mixed')
    filename = f'{i+1:03d}-' + re.sub(r'[^a-z0-9]+', '-', r[0].lower()).strip('-') + '.png'
    venues.append(dict(name=r[0].strip(), addr=addr, hood=r[3].strip(), years=years,
        cap=cap, ticketPrice=price, type=types.get(r[1], 0), genres=gs,
        artistType=r[18].strip().lower() if r[18].strip().lower() in ['local','touring'] else 'mixed',
        independent=True if r[13].lower() == 'yes' else False if r[13].lower() == 'no' else None,
        filename=filename, notes=notes, source_address=r[2]))

if FINAL_SHEET:
    final_types = {'Music Club': 0, 'Night Club': 1, 'Concert Hall / Theater': 2,
                   'Bar / Pub': 3, 'Arena': 4, 'Third Space': 5, 'Outdoors': 6,
                   'Restaurant / Cafe': 13}
    final_pack = {'spread out': 0, 'spread out (one word per slot)': 0, 'balanced': 1,
                  'fit more words per line': 2, 'split words across containers': 3}
    venues = []
    with (ROOT / 'data/Venue Final Content - Final Data.csv').open(newline='') as source:
        for i, row in enumerate(csv.DictReader(source), 1):
            name = row['Name'].strip()
            if not name:
                continue
            prices = re.findall(r'\d+', row['Price'])
            price = (0 if row['Price'] == 'Free' else 10 if row['Price'].startswith('<') else
                     sum(map(int, prices)) / len(prices))
            words = row['Address'].strip().split()
            address = ' '.join([*words[:2], '\u00a0'.join(words[2:])]).strip()
            genre_ids = [genres.index(g) if g in genres else genres.index('mixed')
                         for g in (value.strip().lower() for value in row['Genres'].split(','))]
            venues.append(dict(name=name, addr=address, hood=row['Location'].strip(),
                years=int(row['Years']), cap=int(re.sub(r'[^0-9]', '', row['Capacity'])),
                ticketPrice=price, type=final_types[row['Type '].strip()],
                genres=list(dict.fromkeys(genre_ids)), artistType=row['Artists'].strip().lower(),
                independent=row['Owner'].strip() == 'Independent',
                venueStatus=row['Status'].strip(),
                pack=final_pack.get(row['Line packing'].strip().lower(), 0),
                latitude=float(row['Latitude']) if row['Latitude'].strip() else None,
                longitude=float(row['Longitude']) if row['Longitude'].strip() else None,
                filename=f'{i:03d}-' + re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-') + '.png'))

batch = r"""
(async () => {
try {
  DF = opentype.parse(await (await fetch('/fonts/manicotti-regular-testing.otf')).arrayBuffer());
  const venues = await (await fetch('/batch-data')).json();
  const nameSlots = {};
  for (const venue of venues) {
    S = {...DEF, ...venue, colorStyle:'offsetGradient', vectorOutlines:true};
    const point = neighborhoodIndex.get(normalizeNeighborhood(S.hood));
    S.latitude = venue.latitude ?? point?.latitude ?? null;
    S.longitude = venue.longitude ?? point?.longitude ?? null;
    nameSlots[venue.filename] = venueNameSlots(activeGrid());
    const svg = build();
    const blob = new Blob([svg], {type:'image/svg+xml'});
    const url = URL.createObjectURL(blob);
    const im = new Image();
    await new Promise((resolve,reject) => { im.onload=resolve; im.onerror=reject; im.src=url; });
    const canvas = document.createElement('canvas'); canvas.width=1200; canvas.height=1800;
    canvas.getContext('2d').drawImage(im,0,0,1200,1800);
    URL.revokeObjectURL(url);
    const png = await new Promise(resolve => canvas.toBlob(resolve,'image/png'));
    const response = await fetch('/save/'+venue.filename,{method:'POST',body:png});
    if (!response.ok) throw Error('Save failed: '+venue.filename);
  }
  await fetch('/done',{method:'POST',body:JSON.stringify(nameSlots)});
} catch(e) { await fetch('/error',{method:'POST',body:String(e.stack || e)}); }
})();
"""
if PRICE_ARTIST:
    batch = batch.replace("colorStyle:'offsetGradient'", "colorStyle:'offsetPriceArtistFill'")
elif OWNERSHIP:
    batch = batch.replace("colorStyle:'offsetGradient'", "colorStyle:'offsetOwnershipRounding'")
elif ALTERNATE:
    batch = batch.replace("colorStyle:'offsetGradient'", "colorStyle:'offsetGradientSeparate'")
# Keep all address words: split only ordinary spaces in the renderer.
html = (ROOT / 'index.html').read_text().replace('https://cdnjs.cloudflare.com/ajax/libs/opentype.js/1.3.4/opentype.min.js', '/opentype.js')
html = html.replace("S.addr.trim().toUpperCase().split(/\\s+/)", "S.addr.trim().toUpperCase().split(/ +/)")
html = html.replace('</body>', '<script>' + batch + '</script></body>')
finished = threading.Event()
errors = []
received = set()
if MAKE_SHEET:
    from PIL import Image, ImageDraw, ImageFont
    columns, thumb_w, thumb_h, cell_w, cell_h = (11 if FINAL_SHEET else 7), 300, 450, 320, 505
    sheet = Image.new('RGB', (columns * cell_w + 20, math.ceil(len(venues) / columns) * cell_h + 90), '#f4f1e9')
    sheet_draw = ImageDraw.Draw(sheet)
    label_font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 16)
    title_font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 26)
    sheet_draw.text((20, 18), 'SAN FRANCISCO MUSIC VENUES' + ('' if FINAL_SHEET else ' / ' + VERSION), fill='#202020', font=title_font)
    style_label = ('Price rounding + artist type fill' if PRICE_ARTIST else
                   'Ownership rounding + artist type fill' if OWNERSHIP else
                   'Offset outlines + separate type color' if ALTERNATE else
                   'Offset outlines + gradient background / Revised genre palette')
    sheet_draw.text((20, 52), f'{len(venues)} postcards / {style_label}', fill='#404040', font=label_font)
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def log_message(self, *args):
        pass
    def do_GET(self):
        payload = html.encode() if self.path == '/batch' else json.dumps(venues).encode() if self.path == '/batch-data' else (ROOT / 'scripts/vendor/opentype.min.js').read_bytes() if self.path == '/opentype.js' else None
        if payload is None:
            return super().do_GET()
        self.send_response(200); self.end_headers(); self.wfile.write(payload)
    def do_POST(self):
        payload = self.rfile.read(int(self.headers['Content-Length']))
        if self.path.startswith('/save/'):
            name = self.path.removeprefix('/save/')
            assert name in {v['filename'] for v in venues}
            if MAKE_SHEET:
                index = next(i for i, v in enumerate(venues) if v['filename'] == name)
                with Image.open(io.BytesIO(payload)) as card:
                    assert card.size == (1200, 1800)
                    thumbnail = card.convert('RGB').resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
                    if FULL_PRICE_ARTIST:
                        card.save(OUT / name, dpi=(300, 300))
                x, y = 20 + index % columns * cell_w, 90 + index // columns * cell_h
                sheet.paste(thumbnail, (x, y))
                label = f"{index + 1:02d}  {venues[index]['name']}"
                sheet_draw.text((x, y + thumb_h + 6), '\n'.join(textwrap.wrap(label, width=34)), fill='#202020', font=label_font)
            else:
                (OUT / name).write_bytes(payload)
            received.add(name)
            print(name, flush=True)
        elif self.path == '/error':
            errors.append(payload.decode()); finished.set()
        elif self.path == '/done':
            name_slots = json.loads(payload)
            for venue in venues:
                venue['nameSlots'] = name_slots[venue['filename']]
            finished.set()
        self.send_response(200); self.end_headers()

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
with tempfile.TemporaryDirectory(prefix='postcard-chrome-') as profile:
    log = (Path(tempfile.gettempdir()) / 'postcard-v2-render.log' if MAKE_SHEET else OUT / 'render.log').open('w')
    process = subprocess.Popen(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '--headless', '--no-sandbox', '--disable-gpu', '--no-first-run',
        '--disable-background-networking', '--user-data-dir='+profile,
        f'http://127.0.0.1:{server.server_port}/batch'], stdout=log, stderr=log)
    try:
        if not finished.wait(1200):
            raise RuntimeError('Batch timed out; see render.log')
        if errors:
            raise RuntimeError(errors[0])
    finally:
        process.terminate(); process.wait(timeout=20); server.shutdown(); log.close()
assert len(received) == len(venues), 'Missing venue renders'
if MAKE_SHEET:
    filename = ('contact-sheet-price-rounding-artist-fill.png' if PRICE_ARTIST else
                'contact-sheet-ownership-rounding-artist-fill-palette-6.png' if OWNERSHIP else
                'contact-sheet.png')
    sheet.save(OUT / filename, dpi=(300, 300))
    print(f'Saved contact sheet with {len(received)} venues to {OUT}', flush=True)
    if CONTACT_ONLY:
        sys.exit(0)
(OUT / 'manifest.json').write_text(json.dumps(venues, indent=2, ensure_ascii=False))
if FULL_PRICE_ARTIST:
    print(f'Exported {len(venues)} postcards to {OUT}')
    sys.exit(0)
(OUT / 'README.txt').write_text('98 venue postcards, 1200 x 1800 pixels (4 x 6 inches at 300 ppi).\nStyle: Offset outlines + gradient background; existing tool defaults and licensed local font.\nTicket ranges use midpoints; <20 uses $10; Free uses $0.\nMissing capacity uses 300, missing years open uses 40, missing price uses $30.\nMissing addresses are left blank; no external venue information was added.\nSee manifest.json for exact per-card inputs and defaults.\n')
print(f'Exported {len(venues)} postcards to {OUT}')
