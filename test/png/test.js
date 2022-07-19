const fs = require('fs');
const gen = require('tooltpl').generate;
const Png = require('../../index').Png;

const file1 = fs.readFileSync(__dirname + '/./test.png');
const file2 = fs.readFileSync(__dirname + '/./test_adam7.png');
const file3 = fs.readFileSync(__dirname + '/./test_png8_index.png');

let canvas = '';
let script = '';
const fileList = [file1, file2, file3];

fileList.forEach((file, index) => {
    const png = new Png(file);
    const pixels = png.decode();

    const { width, height } = png;
    const arr = [];

    for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
            arr.push(pixels[j][i].join(','));
        }
    }

    canvas += `<canvas id="canvas${index}" class="canvas" style="width: ${width}px; height: ${height}px;"></canvas>`;
    script += `(function() {
        var canvas = document.getElementById('canvas${index}');
        var ctx = canvas.getContext('2d');
        canvas.width = ${width};
        canvas.height = ${height};

        var pixels = Uint8ClampedArray.from([${arr.join(',')}]);

        var imageData = new ImageData(pixels, ${width}, ${height});
        ctx.putImageData(imageData, 0, 0, 0, 0, ${width}, ${height});
    })();`;
});

const tpl = fs.readFileSync(__dirname + '/./tpl.html', {encoding: 'utf8'});
const html = gen(tpl, {
    canvas,
    script,
});

fs.writeFileSync(__dirname + '/./out.html', html, {encoding: 'utf8'})
