
// Math: Kiểm tra 2 đoạn thẳng giao nhau
function linesIntersect(a, b, c, d, p, q, r, s) {
    const det = (c - a) * (s - q) - (r - p) * (d - b);
    if (det === 0) return false;
    const lambda = ((s - q) * (r - a) + (p - r) * (s - b)) / det;
    const gamma = ((b - d) * (r - a) + (c - a) * (s - b)) / det;
    return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
}

function drawClippedGuideLine(ctx, px, py, dx, dy, minX, minY, maxX, maxY) {
    const EPS = 1e-6;
    const hits = [];
    if (Math.abs(dx) > EPS) {
        const tLeft = (minX - px) / dx;
        const yLeft = py + tLeft * dy;
        if (yLeft >= minY - EPS && yLeft <= maxY + EPS) hits.push({ x: minX, y: yLeft, t: tLeft });
        const tRight = (maxX - px) / dx;
        const yRight = py + tRight * dy;
        if (yRight >= minY - EPS && yRight <= maxY + EPS) hits.push({ x: maxX, y: yRight, t: tRight });
    }
    if (Math.abs(dy) > EPS) {
        const tTop = (minY - py) / dy;
        const xTop = px + tTop * dx;
        if (xTop >= minX - EPS && xTop <= maxX + EPS) hits.push({ x: xTop, y: minY, t: tTop });
        const tBottom = (maxY - py) / dy;
        const xBottom = px + tBottom * dx;
        if (xBottom >= minX - EPS && xBottom <= maxX + EPS) hits.push({ x: xBottom, y: maxY, t: tBottom });
    }
    if (hits.length < 2) return;
    hits.sort((a, b) => a.t - b.t);
    const p1 = hits[0];
    const p2 = hits[hits.length - 1];
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
}

function clamp01(val) {
    return Math.min(1, Math.max(0, Number(val)));
}

function getCarEdges(corners) {
    return [[corners[0], corners[1]], [corners[1], corners[2]], [corners[2], corners[3]], [corners[3], corners[0]]];
}

function hasAnyEdgeIntersection(edges, lines, intersectFn = linesIntersect) {
    for (const edge of edges) {
        for (const line of lines) {
            if (intersectFn(edge[0].x, edge[0].y, edge[1].x, edge[1].y, line.x1, line.y1, line.x2, line.y2)) {
                return true;
            }
        }
    }
    return false;
}

function showWarning(element, text, color) {
    if (!element) return;
    element.innerText = text;
    element.style.backgroundColor = color;
    element.style.display = 'block';
}

function prepareImageCrop(image, cropState) {
    if (!image || !cropState) return false;
    if (!image.complete || image.naturalWidth <= 0) return false;
    if (cropState.ready) return true;

    const w = image.naturalWidth;
    const h = image.naturalHeight;
    const offCanvas = (typeof OffscreenCanvas !== 'undefined')
        ? new OffscreenCanvas(w, h)
        : (typeof document !== 'undefined'
            ? Object.assign(document.createElement('canvas'), { width: w, height: h })
            : null);

    if (!offCanvas) {
        cropState.sx = 0;
        cropState.sy = 0;
        cropState.sw = w;
        cropState.sh = h;
        cropState.ready = true;
        return true;
    }

    const offCtx = offCanvas.getContext('2d');
    if (!offCtx) {
        cropState.sx = 0;
        cropState.sy = 0;
        cropState.sw = w;
        cropState.sh = h;
        cropState.ready = true;
        return true;
    }

    offCtx.drawImage(image, 0, 0);
    const imgData = offCtx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (imgData[(y * w + x) * 4 + 3] > 12) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }
    }

    if (maxX >= minX && maxY >= minY) {
        cropState.sx = minX;
        cropState.sy = minY;
        cropState.sw = maxX - minX + 1;
        cropState.sh = maxY - minY + 1;
    } else {
        cropState.sx = 0;
        cropState.sy = 0;
        cropState.sw = w;
        cropState.sh = h;
    }
    cropState.ready = true;
    return true;
}

// Đảm bảo các hàm toàn cục có thể truy cập từ file mode
if (typeof window !== 'undefined') {
    window.linesIntersect = linesIntersect;
    window.drawClippedGuideLine = drawClippedGuideLine;
    window.GameUtils = {
        clamp01,
        getCarEdges,
        hasAnyEdgeIntersection,
        showWarning,
        prepareImageCrop
    };
}