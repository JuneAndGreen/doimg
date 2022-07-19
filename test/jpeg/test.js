const fs = require('fs');
const gen = require('tooltpl').generate;
const Jpeg = require('../../index').Jpeg;

const file = fs.readFileSync(__dirname + '/./test.jpeg');

const jpeg = new Jpeg(file);
const pixels = jpeg.decode();

const { width, height } = jpeg;
const arr = []

for (let i = 0; i < height; i++) {
    for (let j = 0; j < width; j++) {
        arr.push(pixels[j][i].join(',') + ',255');
    }
}

const canvas = `<canvas id="canvas" class="canvas" style="width: ${width}px; height: ${height}px;"></canvas>`;
const script = `(function() {
    var canvas = document.getElementById('canvas');
    var ctx = canvas.getContext('2d');
    canvas.width = ${width};
    canvas.height = ${height};

    var pixels = Uint8ClampedArray.from([${arr.join(',')}]);

    var imageData = new ImageData(pixels, ${width}, ${height});
    ctx.putImageData(imageData, 0, 0, 0, 0, ${width}, ${height});
})();`;

const tpl = fs.readFileSync(__dirname + '/./tpl.html', {encoding: 'utf8'});
const html = gen(tpl, {
    canvas,
    script,
});

fs.writeFileSync(__dirname + '/./out.html', html, { encoding: 'utf8' })
