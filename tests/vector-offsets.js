// Run in a browser after clipper.js and vectorOffsets.js are loaded.
// The same tests can run in a JavaScript engine with an XML DOM adapter.
function testVectorOffsets() {
  const assert = (value, label) => { if (!value) throw Error(label); };
  const area = d => {
    let total = 0;
    for (const contour of d.split('M ').slice(1)) {
      const numbers = contour.match(/-?[\d.]+/g).map(Number), points = [];
      for (let i = 0; i < numbers.length; i += 2) points.push({X: numbers[i], Y: numbers[i+1]});
      total += ClipperLib.Clipper.Area(points);
    }
    return Math.abs(total);
  };
  const rectangle = '<path d="M 0 0 H 100 V 100 H 0 Z"/>';
  const result = vectorOffsetPaths(rectangle, [12,9]);
  assert(Math.abs(area(result[0])-124*124) < .01, '12-unit rectangular offset');
  assert(Math.abs(area(result[1])-118*118) < .01, '9-unit gap offset');
  assert(result.every(d => !/[CQ]/.test(d)), 'Offsets contain straight vector segments');
  assert((result[0].match(/ L /g) || []).length === 3, 'Outer rectangle retains four sharp corners');
  const touching = rectangle + '<path d="M 100 0 H 200 V 100 H 100 Z"/>';
  const merged = vectorOffsetPaths(touching, [12])[0];
  assert(merged.split('M ').length === 2, 'Touching letters merge without seams');
  assert(Math.abs(area(merged)-224*124) < .01, 'Merged silhouette expands once');
  const hole = '<path d="M 0 0 H 200 V 200 H 0 Z M 50 50 V 150 H 150 V 50 Z"/>';
  assert(Math.abs(area(vectorOffsetPaths(hole,[10])[0])-(220*220-80*80)) < .01,
    'Counters shrink while outer contours expand');
  const clipped = '<defs><g id="glyph">' + rectangle + '</g>' +
    '<clipPath id="slice"><rect width="50" height="100"/></clipPath></defs>' +
    '<g transform="translate(20 30) scale(2 1)"><g clip-path="url(#slice)"><use href="#glyph"/></g></g>';
  const slice = vectorOffsetPaths(clipped,[0])[0];
  assert(Math.abs(area(slice)-10000) < .01, 'Transformed slice clipping');
  assert(slice.includes('20 30') && slice.includes('120 130'), 'Transforms preserve placement');
  const rotated = '<g transform="translate(200 0) rotate(90)">' + rectangle + '</g>';
  assert(Math.abs(area(vectorOffsetPaths(rotated,[12])[0])-124*124) < .01,
    'Rotated lettering offsets in postcard coordinates');
  const repeated = vectorOffsetPaths(rotated,[12,9]);
  assert(repeated[0] === vectorOffsetPaths(rotated,[12])[0], 'Cached offsets remain stable');
  const decode = d => d.split('M ').slice(1).map(contour => {
    const values = contour.match(/-?[\d.]+/g).map(Number), points = [];
    for (let i = 0; i < values.length; i += 2) points.push({X: values[i], Y: values[i+1]});
    return points;
  });
  const acute = '<path d="M 0 0 L 200 0 L 1 3 Z"/>',
    radii = [9,12,21,24,45,48,93,96,117,120],
    expanded = vectorOffsetPaths(acute,radii);
  expanded.forEach((d, i) => {
    for (const ring of decode(d)) for (const p of ring) {
      assert(p.X >= -2*radii[i]-.02 && p.X <= 200+2*radii[i]+.02 &&
        p.Y >= -2*radii[i]-.02 && p.Y <= 3+2*radii[i]+.02, 'Acute join creates no extended spikes');
    }
    if (i === 0) return;
    const clipper = new ClipperLib.Clipper(), outside = [];
    clipper.AddPaths(decode(expanded[i-1]), ClipperLib.PolyType.ptSubject, true);
    clipper.AddPaths(decode(d), ClipperLib.PolyType.ptClip, true);
    clipper.Execute(ClipperLib.ClipType.ctDifference, outside,
      ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    assert(outside.reduce((sum,p) => sum+Math.abs(ClipperLib.Clipper.Area(p)),0) < 1,
      'Larger repetitions contain smaller offsets without crossings');
  });
  const circlePoints = Array.from({length: 72}, (_,i) => {
    const angle = i*Math.PI/36;
    return `${(100*Math.cos(angle)).toFixed(3)} ${(100*Math.sin(angle)).toFixed(3)}`;
  });
  const circle = '<path d="M ' + circlePoints.join(' L ') + ' Z"/>';
  const curved = decode(vectorOffsetPaths(circle,[120])[0]);
  for (const ring of curved) for (const p of ring) {
    assert(Math.abs(Math.hypot(p.X,p.Y)-220) < 1, 'Smooth curve stays round at large offsets');
  }
  assert(curved[0].length > 40, 'Curves retain smooth joins rather than large facets');
  const pocket = '<path d="M 0 0 H 200 V 200 H 0 Z M 50 50 V 70 H 70 V 50 Z"/>',
    local = decode(vectorOffsetPaths(pocket,[0])[0]),
    outside = local.find(p => ClipperLib.Clipper.Area(p) > 0),
    inside = local.find(p => ClipperLib.Clipper.Area(p) < 0);
  assert(outside.length === 4 && Math.abs(ClipperLib.Clipper.Area(outside)) === 40000,
    'Local pocket cleanup preserves the surrounding contour');
  assert(inside.length === 4 && Math.abs(ClipperLib.Clipper.Area(inside)) === 400,
    'Interior simplification preserves sharp corners and pocket size');
  const pocketOffsets = vectorOffsetPaths(pocket,[3,6]).map(decode);
  const holeAreas = pocketOffsets.map(paths => Math.abs(ClipperLib.Clipper.Area(
    paths.find(p => ClipperLib.Clipper.Area(p) < 0))));
  assert(holeAreas[0] === 14*14 && holeAreas[1] === 8*8,
    'Ink and gap use consistent three-unit interior offsets');
  return 'PASS: sharp corners, smooth curves, spacing, union, counters, clips, transforms, cache, acute joins, nested repetitions';
}
