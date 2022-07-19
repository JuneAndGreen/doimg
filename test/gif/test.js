const fs = require('fs');
const gen = require('tooltpl').generate;
const Gif = require('../../index').Gif;

const file1 = fs.readFileSync(__dirname + '/./test.gif');
const file2 = fs.readFileSync(__dirname + '/./test_interlace.gif');

let canvas = '';
let script = `
    var btn = document.getElementById('btn');
    var isPlay = false;
    btn.onclick = function() {
        if (isPlay) return;

        isPlay = true;
        window.play0();
        window.play1();
    };
`;
const fileList = [file1, file2];

fileList.forEach((file, index) => {
    const gif = new Gif(file);
    const images = gif.decode();

    const { width, height } = gif;
    const delayTimeList = [];
    const count = images.length;

    let subScript = ''
    images.forEach(image => {
        const { pixels, delayTime, left, top, width, height } = image;
        const arr = [];

        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {
                const pixel = pixels[j][i];
                pixel[3] *= 255;
                arr.push(pixel.join(','));
            }
        }

        subScript += `
            list.push({
                image: new ImageData(Uint8ClampedArray.from([${arr.join(',')}]), ${width}, ${height}),
                left: ${left},
                top: ${top},
                width: ${width},
                height: ${height},
            });
        `;
        delayTimeList.push(delayTime * 10);
    })
    
    canvas += `<canvas id="canvas${index}" class="canvas" style="width: ${width}px; height: ${height}px;"></canvas>`;
    script += `(function() {
        var canvas = document.getElementById('canvas${index}');
        var ctx = canvas.getContext('2d');
        canvas.width = ${width};
        canvas.height = ${height};

        var list = [];
        ${subScript}
        var delayTime = [${delayTimeList.join(',')}];
        var count = ${count};

        var info = list[0];
        ctx.putImageData(info.image, info.left, info.top, 0, 0, info.width, info.height);

        window.play${index} = function() {
            now = 0;

            var next = function(index) {
                setTimeout(function() {
                    var info = list[now];
                    ctx.putImageData(info.image, info.left, info.top, 0, 0, info.width, info.height);

                    now++;
                    if (now >= count) now = 0;

                    next(now);
                }, delayTime[index]);
            };

            next(0);
        }
    })();`;    
});

const tpl = fs.readFileSync(__dirname + '/./tpl.html', {encoding: 'utf8'});
const html = gen(tpl, {
    canvas,
    script,
});

fs.writeFileSync(__dirname + '/./out.html', html, {encoding: 'utf8'})
