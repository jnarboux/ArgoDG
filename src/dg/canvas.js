import { removeLaTeX, laTeX2HTML, splitSubSupScript } from './latex.js';
import { getOpacity } from './colors.js';
import { Complex } from '../complex_geom.js';
import canvas2SVG from "canvas2svg";
import * as ToolImages from './tool_images.js';
import { splitFont, reduceFont } from './font.js';

// delegate all object access to given list of objects
function Delegate(objects) {
    return new Proxy({}, {
        get: function(target, property) {
            if (property in objects[0] && typeof objects[0][property] !== 'function')
                return objects[0][property];
            else
                return function(...args) {
                    let retVal = undefined;
                    objects.forEach(obj => {
                        if (typeof obj[property] === 'function') {
                            const objRetVal = obj[property].apply(obj, args);
                            // return the first value
                            if (retVal === undefined)
                                retVal = objRetVal;
                        }
                    });
                    return retVal;
                }
        },
        set: function(target, property, value) {
            objects.forEach(obj => { if (property in obj) obj[property] = value; });
            return true;
        }
    });
}


// -----------------------------------------------------------------------------
// encapsulate drawing canvas with a few basic drawing primitives
// -----------------------------------------------------------------------------
class Canvas {
    constructor(element, options) {
        if (typeof element == "string")
            element = document.getElementById(element);

        if (element instanceof HTMLCanvasElement) {
            this._canvas = element;
            this._container = document.createElement("div");
            this._canvas.parentNode.replaceChild(this._container, this._canvas);
            this._container.append(this._canvas);
            this._container.style.width = "500px";
            const h1 = document.getElementsByTagName("h1")[0];
            h1.style.textAlign = "center";
            h1.style.marginTop = "45px";
        } else {
            this._container = element;
            this._canvas = document.createElement("canvas");
            this._container.innerHTML = "";
            this._container.append(this._canvas);
            this._canvas.width = this._container.width;
            this._canvas.height = this._container.height;
        }

        this._container.style.marginLeft = "auto";
        this._container.style.marginRight = "auto";

        const ratio = window.devicePixelRatio;
        
        if (options.width)
            this.setCanvasWidth(options.width);

        if (options.height)
            this.setCanvasHeight(options.height);

        if (options.border)
            this._canvas.style.border = options.border;

        // setup canvas drawing context
        this._canvas_ctx = this._canvas.getContext("2d");
        this._canvas_ctx.scale(ratio, ratio);

        
        if (options.saveSVG) {
            this._saveSVG = true;
            // drawing simultaneously onto SVG and onto canvas context
            this._canvas2SVG = new canvas2SVG(this._canvas);
            this._ctx = Delegate([this._canvas_ctx, this._canvas2SVG]);
        } else {
            this._saveSVG = false;
            this._ctx = this._canvas_ctx;
        }

        this._defaultColor = "black";
        this._defaultWidth = 1;
        this._defaultDash = [];

        // add status line paragraph
        const p = document.createElement("p");;
        p.id = "status-line";
        this._p_status = p;
        this._canvas_container = document.createElement("div");
        this._canvas_container.style.width = this._canvas.style.width;
        
        this._canvas.parentNode.replaceChild(this._canvas_container, this._canvas);
        this._canvas_container.style.position = "relative";
        this._canvas_container.append(this._canvas);
        this._canvas_container.append(p);
        p.style.position = "absolute";
        p.style.top = "0px";
        p.style.left = "0px";
        p.style.margin = "5px";
        p.style.display = "none";

        // add save svg button
        if (options.saveSVG) {
            const saveSvgIcon = document.createElement("img");
            saveSvgIcon.style.border = "1px solid #555";
            saveSvgIcon.style.borderRadius = "5px";
            saveSvgIcon.style.opacity = "0.5";
            saveSvgIcon.style.margin = "1px";
            saveSvgIcon.src = ToolImages.save_svg;
            saveSvgIcon.style.position = "absolute";
            saveSvgIcon.style.top = "0px";
            saveSvgIcon.style.right = "0px";
            saveSvgIcon.style.display = "none";
            this._canvas_container.append(saveSvgIcon);
            const canvas = this._canvas;
            canvas.addEventListener('mousemove', function(event) {
                // Check if mouse pointer is in the top right corner
                if (event.offsetX >= canvas.clientWidth - 40 && event.offsetY <= 40) {
                    saveSvgIcon.style.display = 'block';
                } else {
                    saveSvgIcon.style.display = 'none';
                }
            });
            saveSvgIcon.addEventListener('mouseout', function() {
                saveSvgIcon.style.display = 'none';
            });
            const self = this;
            saveSvgIcon.addEventListener('click', function() {
                // Get the content of the SVG from the canvas
                var svgContent = self.svg();

                // Create a new Blob object with the SVG content
                var blob = new Blob([svgContent], { type: 'image/svg+xml' });

                // Create a temporary URL to the Blob object
                var url = URL.createObjectURL(blob);
            
                // Create a new anchor element for the download link
                var link = document.createElement('a');
                link.href = url;
                link.download = 'ArgoDG.svg';

                // Programmatically click the download link
                link.click();

                // Remove the temporary URL and the anchor element
                URL.revokeObjectURL(url);
                link.remove();
            });
        }
    }

    addElement(e) {
        this._canvas_container.append(e);
    }

    canvas() {
        return this._canvas;
    }
    
    container() {
        return this._container;
    }

    addEventListener(event, fun) {
        this._canvas.addEventListener(event, fun);
    }

    setCanvasWidth(width) {
        const ratio = window.devicePixelRatio;
        this._canvas.width = width * ratio;
        this._canvas.style.width = width + "px";
    }

    setWidth(width) {
        this.setCanvasWidth(width);
        const ratio = window.devicePixelRatio;
        this._canvas_ctx = this._canvas.getContext("2d");
        this._canvas_ctx.scale(ratio, ratio);
    }

    setCanvasHeight(height) {
        const ratio = window.devicePixelRatio;
        this._canvas.height = height * ratio;
        this._canvas.style.height = height + "px";
    }

    setHeight(height) {
        this.setCanvasHeight(height);
        const ratio = window.devicePixelRatio;
        this._canvas_ctx = this._canvas.getContext("2d");
        this._canvas_ctx.scale(ratio, ratio);
    }

    width() {
        const ratio = window.devicePixelRatio;
        return this._canvas.width / ratio;
    }

    height() {
        const ratio = window.devicePixelRatio;
        return this._canvas.height / ratio;
    }

    context() {
        return this._ctx;
    }

    clear() {
        const ctx = this.context();
        ctx.clearRect(0, 0, this.width(), this.height());
        if (this._saveSVG) {
            this._canvas2SVG = new canvas2SVG(this._canvas);
            const ratio = window.devicePixelRatio;
            this._canvas2SVG.scale(ratio, ratio);
            this._ctx = Delegate([this._canvas_ctx, this._canvas2SVG]);
        }
    }

    arc(x, y, r, angle_from, angle_to, counterclockwise, color, width, dash, fillColor) {
        // due to bugs in Firefox and Chrome arc primitive large circles are drawn specially
        if (angle_from == 0 && angle_to == 2 * Math.PI) {
            if (r > 500 * this.width()) {
                const intersections = this.circle_endpoints(x, y, r);
                if (intersections.length == 2) {
                    this.segment(intersections[0][0], intersections[0][1],
                                 intersections[1][0], intersections[1][1],
                                 color, width, dash);
                }
                return;
            }

            // special fix for Firefox - split circle to two arc
            if (navigator.userAgent.includes("Firefox") &&
                r > this.width()) {
                const intersections = this.circle_endpoints(x, y, r);
                if (intersections.length == 2) {
                    const P1 = new Complex(intersections[0][0], intersections[0][1]);
                    const P2 = new Complex(intersections[1][0], intersections[1][1]);
                    this.arc(P1.x(), P1.y(), 2, 0, 2*Math.PI, true, "green");
                    this.arc(P2.x(), P2.y(), 2, 0, 2*Math.PI, true, "green");
                    const c = new Complex(x, y);
                    const a1 = P1.sub(c).arg();
                    const a2 = P2.sub(c).arg();
                    this.arc(x, y, r, a1, a2, counterclockwise, color, width, dash, fillColor);
                    this.arc(x, y, r, a1, a2, !counterclockwise, color, width, dash, fillColor);
                    return;
                }
            }
        }
        
        color = color || this._defaultColor;
        width = width || this._defaultWidth;
        dash = dash || this._defaultDash;
        
        const ctx = this.context();
        ctx.lineWidth = width;
        ctx.setLineDash(dash);
        if (fillColor) {
            const full = Math.abs(angle_to - angle_from) >= 2*Math.PI;
            ctx.beginPath();
            if (!full)
                ctx.moveTo(x, y);
            ctx.arc(x, y, r, angle_from, angle_to, counterclockwise);
            if (!full)
                ctx.closePath();
            
            ctx.fillStyle = fillColor;
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.arc(x, y, r, angle_from, angle_to, counterclockwise);
            ctx.strokeStyle = color;
            ctx.stroke();
        }
    }
    
    circle(x, y, r, color, width, dash, fill) {
        this.arc(x, y, r, 0, 2*Math.PI, true, color, width, dash, fill);
    }

    point(x, y, color) {
        const ctx = this.context();
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, 2*Math.PI, true);
        ctx.strokeStyle = color;
        ctx.stroke();
    }

    segment(x1, y1, x2, y2, color, width, dash) {
        color = color || this._defaultColor;
        width = width || this._defaultWidth;
        dash = dash || this._defaultDash;
        const ctx = this.context();
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.setLineDash(dash);
        ctx.stroke();
    }

    vector(x1, y1, x2, y2, color, width, dash) {
        color = color || this._defaultColor;
        width = width || this._defaultWidth;
        dash = dash || this._defaultDash;
        const ctx = this.context();
        
        var d = Math.sqrt((x2-x1)*(x2-x1) + (y2-y1)*(y2-y1));
        
        ctx.save();
        ctx.translate(x1, y1);
        var alpha = Math.atan2(y2 - y1, x2 - x1);
        ctx.rotate(alpha);

        var r = 15;
        var bottomX = 0, bottomY = 0;
        var topX = d, topY = 0;

        // draw line
        ctx.beginPath();
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.moveTo(bottomX, bottomY);
        ctx.lineTo(topX, topY);
        ctx.stroke();

        // draw "arrow"
        ctx.beginPath();
        ctx.moveTo(topX - r, topY - 5);
        ctx.lineTo(topX, topY);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(topX - r, topY + 5);
        ctx.lineTo(topX, topY);
        ctx.stroke();

        ctx.restore();
    }

    // open path through the given points
    polyline(points, color, width, dash) {
        if (points.length < 2)
            return;
        color = color || this._defaultColor;
        width = width || this._defaultWidth;
        dash = dash || this._defaultDash;
        const ctx = this.context();
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++)
            ctx.lineTo(points[i][0], points[i][1]);
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.setLineDash(dash);
        ctx.stroke();
    }

    polygon(points, borderColor, width, dash, fillColor) {
        if (points.length == 0)
            return;
        const ctx = this.context();
        ctx.save();
        borderColor = borderColor || this._defaultColor;
        width = width || this._defaultWidth;
        dash = dash || this._defaultDash;
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++)
            ctx.lineTo(points[i][0], points[i][1]);
        ctx.lineTo(points[0][0], points[0][1]);
        ctx.lineWidth = width;
        ctx.strokeStyle = borderColor;
        if (fillColor)
            ctx.fillStyle = fillColor;
        else
            ctx.fillStyle = "rgba(0, 0, 0, 0)";
        ctx.setLineDash(dash);

        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    segment_complement(x1, y1, x2, y2, color, width, dash) {
        color = color || this._defaultColor;
        width = width || this._defaultWidth;
        dash = dash || this._defaultDash;
        const [x1l, y1l, x2l, y2l] = this.line_endpoints(x1, y1, x2, y2);
        this.segment(x1l, y1l, x1, y1);
        this.segment(x2, y2, x2l, y2l);
    }

    circle_endpoints(x, y, r) {
        const [w, h] = [this.width(), this.height()];
        const inUL = x*x + y*y < r*r;
        const inUR = (x - w)*(x - w) + y*y < r*r;
        const inDL = x*x + (y - h) * (y - h);
        const inDR = (x - w)*(x - w) + (y - h)*(y - h) < r*r;

        const intersections = [];
        if (inUL != inUR) {
            const d = Math.sqrt(r*r - y*y);
            const x0 = x + d;
            const x1 = x - d;
            if (0 <= x0 && x0 <= w)
                intersections.push([x0, 0]);
            else if (0 <= x1 && x1 <= w)
                intersections.push([x1, 0]);
        }

        if (inDL != inDR) {
            const d = Math.sqrt(r*r - (y - h)*(y - h));
            const x0 = x + d;
            const x1 = x - d;
            if (0 <= x0 && x0 <= w)
                intersections.push([x0, h]);
            else if (0 <= x1 && x1 <= w)
                intersections.push([x1, h]);
        }

        if (inUL != inDL) {
            const d = Math.sqrt(r*r - x*x);
            const y0 = y + d;
            const y1 = y - d;
            if (0 <= y0 && y0 <= h)
                intersections.push([0, y0]);
            else if (0 <= y1 && y1 <= h)
                intersections.push([0, y1]);
        }

        if (inUR != inDR) {
            const d = Math.sqrt(r*r - (x - w)*(x - w));
            const y0 = y + d;
            const y1 = y - d;
            if (0 <= y0 && y0 <= h)
                intersections.push([w, y0]);
            else if (0 <= y1 && y1 <= h)
                intersections.push([w, y1]);
        }

        return intersections;
    }

    line_endpoints(x1, y1, x2, y2) {
        const [w, h] = [this.width(), this.height()];

        if (x1 == x2)
            return [x1, 0, x1, h];
        else if (y1 == y2)
            return [0, y1, w, y1];
        else {
            let intersections = []

            function point(t) {
                const x = x1 + t * (x2 - x1);
                const y = y1 + t * (y2 - y1);
                return [x, y];
            }

            let t, x, y;
            
            t = (0 - x1) / (x2 - x1);
            [x, y] = point(t);

            if (0 <= y && y <= h)
                intersections.push.apply(intersections, [x, y]);

            t = (w - x1) / (x2 - x1);
            [x, y] = point(t);

            if (0 <= y && y <= h)
                intersections.push.apply(intersections, [x, y]);

            if (intersections.length == 4)
                return intersections;

            t = (0 - y1) / (y2 - y1);
            [x, y] = point(t);

            if (0 <= x && x <= w)
                intersections.push.apply(intersections, [x, y]);
            
            if (intersections.length == 4)
                return intersections;
            
            t = (h - y1) / (y2 - y1);
            [x, y] = point(t);

            if (0 <= x && x <= w)
                intersections.push.apply(intersections, [x, y]);

            return intersections;
        }
    }

    line(x1, y1, x2, y2, color, width, dash) {
        const [x1l, y1l, x2l, y2l] = this.line_endpoints(x1, y1, x2, y2);
        this.segment(x1l, y1l, x2l, y2l, color, width, dash);
    }

    ray(x1, y1, x2, y2, color, width, dash) {
        const [x1l, y1l, x2l, y2l] = this.line_endpoints(x1, y1, x2, y2);
        function between1(a, m, b) {
            return (a <= m && m <= b) || (b <= m && m <= a);
        }
        function between(xa, ya, x, y, xb, yb) {
            return between1(xa, x, xb) && between1(ya, y, yb);
        }
        
        if (!between(x1l, y1l, x1, y1, x2l, y2l)) {
            if (between(x1, y1, x1l, y1l, x2, y2) ||
                between(x1, y1, x2l, x2l, x2, y2))
                this.segment(x1l, y1l, x2l, y2l, color, width, dash);
            else
                return;
        }
        if (between(x1l, y1l, x2, y2, x1, y1))
            this.segment(x1, y1, x1l, y1l, color, width, dash);
        else
            this.segment(x1, y1, x2l, y2l, color, width, dash);
    }
    

    line_label(x1, y1, x2, y2, label, color, font) {
        let [x1l, y1l, x2l, y2l] = this.line_endpoints(x1, y1, x2, y2).map(x => Math.round(x));
        if (y1l > y2l)
            [x1l, y1l] = [x2l, y2l];


        const offset = 15;
        let x, y;
        if (x1l == 0) {
            x = 0;
            y = y1l;
        } else if (x1l == this.width()) {
            x = this.width() - offset;
            y = y1l;
        } if (y1l == 0) {
            x = x1l;
            y = offset;
        } else if (y1l == this.height()) {
            x = x1l;
            y = this.height() - offset;
        }
        this.text(x + 1, y, label, "15px Arial", color, font);
    }

    text(x, y, txt, font, color, xAlign, yAlign) {
        font = font || "15px Arial";
        color = color || "black";
        xAlign = xAlign || "left";
        yAlign = yAlign || "middle";

        const width = this.width();
        const height = this.height();
        const ctx = this.context();
        
        function fixMargins(x, y, txt, font) {
            ctx.font = font;
            const metrics = ctx.measureText(removeLaTeX(txt));
            if (x + metrics.width > width)
                x -= (x + metrics.width - width);
            if (x < 0)
                x = 0;
            return [x, y];
        }
        
        function renderText(x, y, txt, font) {
            ctx.font = font;
            ctx.textAlign = xAlign;
            ctx.textBaseline = yAlign;
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.lineJoin = "miter";
	    ctx.miterLimit = 2;
            ctx.strokeText(txt, x, y);
            if (color)
                ctx.fillStyle = color;
            ctx.fillText(txt, x, y);

            const metrics = ctx.measureText(txt);
            const width = metrics.width;
            return x + width;
        }

        function latex(x, y, txt, font) {
            const m = splitSubSupScript(txt);
            
            if (m.subscript || m.supscript) {
                let script, dy;
                if (m.supscript) {
                    script = m.supscript;
                    dy = -2;
                } else if (m.subscript) {
                    script = m.subscript;
                    dy = 2;
                }
                
                const x1 = renderText(x, y, m.text, font);
                const x2 = latex(x1, y + dy, script, reduceFont(font));
                if (!m.rest)
                    return x2;
                    
                return latex(x2, y, m.rest, font);
            } else {
                return renderText(x, y, txt, font);
            }
        }

        [x, y] = fixMargins(x, y, txt, font);
        latex(x, y, txt, font);
    }

    message(msg) {
        // this.text(5, 15, msg, "15px Arial", "black");
        this._p_status.innerHTML = laTeX2HTML(msg);
        if (msg != "") {
            this._p_status.style.display = "block";
        } else 
            this._p_status.style.display = "none";
    }

    addMessage(msg) {
        if (this._p_status.innerHTML)
            this._p_status.innerHTML += "<br/>";
        this._p_status.innerHTML += laTeX2HTML(msg);
    }

    svg() {
        return this._canvas2SVG.getSerializedSvg();
    }
}


export { Canvas };
