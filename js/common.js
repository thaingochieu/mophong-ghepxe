// TỶ LỆ CHUYỂN ĐỔI: 1 mét = 45 pixels
const SCALE = 45;

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

// Đảm bảo các hàm toàn cục có thể truy cập từ file mode
if (typeof window !== 'undefined') {
    window.linesIntersect = linesIntersect;
    window.drawClippedGuideLine = drawClippedGuideLine;
}