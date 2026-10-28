/* Vector polygon offsets. Clipper's license is retained in clipper.js. */
(() => {
  const scale = 100;
  let cachedKey, cachedPaths, cachedOffsets;
  const multiply = (a, b) => [
    a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
    a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]
  ];
  function transform(value) {
    let result = [1,0,0,1,0,0];
    for (const match of (value || '').matchAll(/([a-zA-Z]+)\(([^)]*)\)/g)) {
      const v = match[2].trim().split(/[\s,]+/).map(Number);
      let m;
      if (match[1] === 'matrix') m = v;
      else if (match[1] === 'translate') m = [1,0,0,1,v[0],v[1] || 0];
      else if (match[1] === 'scale') m = [v[0],0,0,v[1] ?? v[0],0,0];
      else if (match[1] === 'rotate') {
        const angle = v[0]*Math.PI/180, c = Math.cos(angle), s = Math.sin(angle);
        const x = v[1] || 0, y = v[2] || 0;
        m = [c,s,-s,c,x-c*x+s*y,y-s*x-c*y];
      } else throw Error('Unsupported outline transform: ' + match[1]);
      result = multiply(result, m);
    }
    return result;
  }
  function polygon(points, matrix) {
    return points.map(([x,y]) => ({
      X: Math.round((matrix[0]*x+matrix[2]*y+matrix[4])*scale),
      Y: Math.round((matrix[1]*x+matrix[3]*y+matrix[5])*scale)
    }));
  }
  function combine(subject, clip, type) {
    if (!subject.length) return [];
    if (clip && !clip.length) return [];
    const c = new ClipperLib.Clipper(), result = [];
    c.StrictlySimple = true;
    c.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
    if (clip) c.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
    c.Execute(type, result, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    return result;
  }
  function pathPolygons(d, matrix) {
    const tokens = d.match(/[MLHVZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi) || [];
    let command, x = 0, y = 0, points = [], result = [];
    const finish = () => { if (points.length >= 3) result.push(polygon(points, matrix)); points = []; };
    for (let i = 0; i < tokens.length;) {
      if (/^[a-z]$/i.test(tokens[i])) {
        command = tokens[i++];
        if (command === 'Z') { finish(); continue; }
        if (command === 'M') finish();
      }
      if (command === 'M' || command === 'L') {
        x = Number(tokens[i++]); y = Number(tokens[i++]); command = 'L';
      } else if (command === 'H') x = Number(tokens[i++]);
      else if (command === 'V') y = Number(tokens[i++]);
      else throw Error('Expected polygon outline, got ' + command);
      points.push([x,y]);
    }
    finish();
    return result;
  }
  function simplifySmallPocket(path) {
    // Positive contours describe the surrounding artwork. Only enclosed,
    // small negative-space pockets get extra anchor reduction.
    const area = ClipperLib.Clipper.Area(path);
    if (area >= 0) return [path];
    const xs = path.map(p => p.X), ys = path.map(p => p.Y),
      width = (Math.max(...xs)-Math.min(...xs))/scale,
      height = (Math.max(...ys)-Math.min(...ys))/scale,
      size = Math.abs(area)/(scale*scale);
    if (size > 3600 && !(Math.min(width,height) <= 24 && size <= 24000)) return [path];
    // Remove redundant/near-collinear anchors without an inset/outset pass.
    // Do this once on the shared source, so ink and gap offsets retain the
    // same three-unit separation instead of independently changing pockets.
    const cleaned = ClipperLib.Clipper.CleanPolygon(path, .9*scale);
    return [cleaned.length >= 3 ? cleaned : path];
  }
  // Resolve transformed glyphs, repeated slices and their clip paths into one
  // polygon union before offsetting, so overlaps cannot leave internal seams.
  function silhouette(markup) {
    const root = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`, 'image/svg+xml').documentElement;
    const ids = new Map([...root.querySelectorAll('[id]')].map(node => [node.id, node]));
    function visit(node, parent, depth = 0) {
      if (depth > 20) throw Error('Recursive outline reference');
      const matrix = multiply(parent, transform(node.getAttribute('transform')));
      let paths = [];
      if (node.localName === 'path') paths = pathPolygons(node.getAttribute('d'), matrix);
      else if (node.localName === 'rect') {
        const n = attr => Number(node.getAttribute(attr) || 0);
        const x = n('x'), y = n('y'), w = n('width'), h = n('height');
        paths = [polygon([[x,y],[x+w,y],[x+w,y+h],[x,y+h]], matrix)];
      } else if (node.localName === 'use') {
        const target = ids.get((node.getAttribute('href') || '').slice(1));
        if (!target) throw Error('Missing outline reference');
        paths = visit(target, matrix, depth+1);
      } else if (['g','svg','clipPath'].includes(node.localName)) {
        for (const child of node.children) paths.push(...visit(child, matrix, depth+1));
      } else if (node.localName !== 'defs') throw Error('Outline needs a loaded vector font');
      // Normalize each glyph's winding independently before combining it with
      // neighboring glyphs. Preserve counter contours as holes.
      if (node.localName === 'path') paths = combine(paths, null, ClipperLib.ClipType.ctUnion);
      const clipId = /url\(#([^)]*)\)/.exec(node.getAttribute('clip-path') || '');
      if (clipId) {
        const target = ids.get(clipId[1]);
        if (!target) throw Error('Missing outline clip');
        paths = combine(paths, visit(target, matrix, depth+1), ClipperLib.ClipType.ctIntersection);
      }
      return paths;
    }
    return combine(visit(root, [1,0,0,1,0,0]), null, ClipperLib.ClipType.ctUnion);
  }
  window.vectorOffsetPaths = (markup, radii) => {
    if (typeof ClipperLib === 'undefined') throw Error('Vector offset library did not load');
    if (cachedKey !== markup) {
      // Remove almost coincident vertices and sub-unit slice teeth after all
      // transforms/clips. Cleaning glyphs before slicing cannot catch those.
      const paths = combine(ClipperLib.Clipper.CleanPolygons(silhouette(markup), .6*scale),
        null, ClipperLib.ClipType.ctUnion);
      cachedPaths = combine(paths.flatMap(simplifySmallPocket), null, ClipperLib.ClipType.ctUnion);
      cachedOffsets = new Map(); cachedKey = markup;
    }
    // Use round joins along sampled curves and at tiny slice teeth. Only a
    // clear corner between substantial edges gets a bounded sharp miter.
    // Override this instance only; the vendored Clipper library stays intact.
    const offset = new ClipperLib.ClipperOffset(2, .1*scale);
    const offsetPoint = offset.OffsetPoint;
    offset.OffsetPoint = function(j, k) {
      const points = this.m_srcPoly, p = points[j],
        before = points[(j+points.length-1)%points.length], after = points[(j+1)%points.length],
        ax = p.X-before.X, ay = p.Y-before.Y, bx = after.X-p.X, by = after.Y-p.Y,
        incoming = Math.hypot(ax,ay), outgoing = Math.hypot(bx,by),
        cosine = (ax*bx+ay*by)/(incoming*outgoing || 1);
      // Keep the original selective joins: smooth curves and tight tips,
      // with sharp corners only on clear, substantial edges.
      const sharp = incoming >= 2*scale && outgoing >= 2*scale &&
        cosine <= Math.cos(50*Math.PI/180) && cosine >= -.5;
      return offsetPoint.call(this, j, k, sharp ?
        ClipperLib.JoinType.jtMiter : ClipperLib.JoinType.jtRound);
    };
    offset.AddPaths(cachedPaths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
    return radii.map(radius => {
      if (!cachedOffsets.has(radius)) {
        const result = [];
        offset.Execute(result, radius*scale);
        const simple = combine(result, null, ClipperLib.ClipType.ctUnion)
          .filter(path => Math.abs(ClipperLib.Clipper.Area(path)) >= scale*scale);
        cachedOffsets.set(radius, simple.map(path => 'M ' + path.map(p =>
          `${p.X/scale} ${p.Y/scale}`).join(' L ') + ' Z').join(' '));
      }
      return cachedOffsets.get(radius);
    });
  };
})();
