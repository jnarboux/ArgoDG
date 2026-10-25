import { DGObject } from './objects.js';

// -----------------------------------------------------------------------------
// Marks used to annotate figures: right angles, congruent segments,
// parallel lines and congruent angles. Their sizes are given in screen
// pixels, so they keep the same look when the view is zoomed.
// -----------------------------------------------------------------------------

// unit vector in screen coordinates from point P to point Q (or null if P = Q)
function screenDir(view, P, Q) {
    const [x1, y1] = view.worldToScreen(P.x(), P.y());
    const [x2, y2] = view.worldToScreen(Q.x(), Q.y());
    const d = Math.hypot(x2 - x1, y2 - y1);
    if (d < 1e-9)
        return null;
    return [(x2 - x1) / d, (y2 - y1) / d];
}

class DGMark extends DGObject {
    constructor(points) {
        super();
        this._points = points;
        points.forEach(p => p.addDependent(this));
        this.recalcMe();
    }

    recalcMe() {
        this._valid = this._points.every(p => p.valid());
    }

    // marks are never selected by the mouse
    isNear(x, y, worldToScreen) {
        return false;
    }

    style() {
        return {color: this.color(), width: this.width(), dash: this.dash(), fillColor: this.fillColor()};
    }
}

// -----------------------------------------------------------------------------
// small square at O marking the right angle AOB
// -----------------------------------------------------------------------------
class DGRightAngleMark extends DGMark {
    constructor(A, O, B, size) {
        super([A, O, B]);
        this._size = size || 10;
    }

    type() {
        return "right angle mark";
    }

    drawMe(view) {
        const [A, O, B] = this._points;
        const u = screenDir(view, O, A), v = screenDir(view, O, B);
        if (!u || !v)
            return;
        const s = this._size;
        const [ox, oy] = view.worldToScreen(O.x(), O.y());
        const p1 = [ox + s * u[0], oy + s * u[1]];
        const p2 = [ox + s * (u[0] + v[0]), oy + s * (u[1] + v[1])];
        const p3 = [ox + s * v[0], oy + s * v[1]];
        const st = this.style();
        const canvas = view.canvas();
        if (st.fillColor)
            canvas.polygon([[ox, oy], p1, p2, p3], "rgba(0, 0, 0, 0)", 1, [], st.fillColor);
        canvas.polyline([p1, p2, p3], st.color, st.width, st.dash);
    }
}

// -----------------------------------------------------------------------------
// n short ticks across the middle of segment AB (congruent segments
// carry the same number of ticks)
// -----------------------------------------------------------------------------
class DGSegmentMark extends DGMark {
    constructor(A, B, n, size) {
        super([A, B]);
        this._n = n || 1;
        this._size = size || 6;
    }

    type() {
        return "segment mark";
    }

    drawMe(view) {
        const [A, B] = this._points;
        const u = screenDir(view, A, B);
        if (!u)
            return;
        const n = [-u[1], u[0]];
        const [mx, my] = view.worldToScreen((A.x() + B.x()) / 2, (A.y() + B.y()) / 2);
        const gap = 4, s = this._size, st = this.style();
        for (let i = 0; i < this._n; i++) {
            const k = (i - (this._n - 1) / 2) * gap;
            const cx = mx + k * u[0], cy = my + k * u[1];
            view.canvas().segment(cx - s * n[0], cy - s * n[1], cx + s * n[0], cy + s * n[1], st.color, st.width, st.dash);
        }
    }
}

// -----------------------------------------------------------------------------
// n chevrons in the middle of segment AB pointing from A towards B
// (parallel lines carry the same number of chevrons)
// -----------------------------------------------------------------------------
class DGParallelMark extends DGMark {
    constructor(A, B, n, size) {
        super([A, B]);
        this._n = n || 1;
        this._size = size || 6;
    }

    type() {
        return "parallel mark";
    }

    drawMe(view) {
        const [A, B] = this._points;
        const u = screenDir(view, A, B);
        if (!u)
            return;
        const n = [-u[1], u[0]];
        const [mx, my] = view.worldToScreen((A.x() + B.x()) / 2, (A.y() + B.y()) / 2);
        const gap = 5, s = this._size, st = this.style();
        for (let i = 0; i < this._n; i++) {
            const k = (i - (this._n - 1) / 2) * gap + s / 2;
            const tx = mx + k * u[0], ty = my + k * u[1];
            view.canvas().polyline([[tx - s * u[0] + s * n[0], ty - s * u[1] + s * n[1]],
                                    [tx, ty],
                                    [tx - s * u[0] - s * n[0], ty - s * u[1] - s * n[1]]],
                                   st.color, st.width, st.dash);
        }
    }
}

// -----------------------------------------------------------------------------
// n concentric arcs marking the convex angle AOB (congruent angles carry
// the same number of arcs); the sector is filled when a fill color is set
// -----------------------------------------------------------------------------
class DGAngleMark extends DGMark {
    constructor(A, O, B, r, n) {
        super([A, O, B]);
        this._r = r || 14;
        this._n = n || 1;
    }

    type() {
        return "angle mark";
    }

    drawMe(view) {
        const [A, O, B] = this._points;
        const u = screenDir(view, O, A), v = screenDir(view, O, B);
        if (!u || !v)
            return;
        const theta = Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]);
        const [ox, oy] = view.worldToScreen(O.x(), O.y());
        const steps = Math.max(2, Math.ceil(Math.abs(theta) / 0.1));
        const arc = r => {
            const pts = [];
            for (let i = 0; i <= steps; i++) {
                const t = theta * i / steps, c = Math.cos(t), s = Math.sin(t);
                pts.push([ox + r * (u[0] * c - u[1] * s), oy + r * (u[0] * s + u[1] * c)]);
            }
            return pts;
        };
        const st = this.style(), canvas = view.canvas();
        if (st.fillColor)
            canvas.polygon([[ox, oy], ...arc(this._r)], "rgba(0, 0, 0, 0)", 1, [], st.fillColor);
        for (let i = 0; i < this._n; i++)
            canvas.polyline(arc(this._r + 4 * i), st.color, st.width, st.dash);
    }
}

export { DGRightAngleMark, DGSegmentMark, DGParallelMark, DGAngleMark };
