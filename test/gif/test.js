'use strict';

const fs = require('fs');
const gen = require('tooltpl').generate;
const Gif = require('../../src/gif');

// let file = fs.readFileSync(__dirname + '/./test.gif');
// let file = fs.readFileSync(__dirname + '/./test_interlace.gif');
// let file = fs.readFileSync(__dirname + '/./test2.gif');
let file = fs.readFileSync(__dirname + '/./test2_interlace.gif');

let gif = new Gif(file);

let images = gif.decode();

let str = '';
let times = [];
images.forEach((image, index) => {
    times.push(image.delayTime * 10);

    str += '<div class="cnt cnt-' + index + '" style="left: ' + (image.left * 2) + 'px; top: ' + (image.top * 2) + 'px; width: ' + (image.width * 2) + 'px; height: ' + (image.height * 2) + 'px;">';

    for(let i=0; i<image.width; i++) {
        str += '<div class="cloumn">';
        for(let j=0; j<image.height; j++) {
            str += '<div class="item" style="background: rgba(' + image.pixels[i][j].join(',') + ')"></div>';
        }
        str += '</div>';
    }

    str += '</div>';
})

let tpl = fs.readFileSync(__dirname + '/./tpl.html', {encoding: 'utf8'});
let script = `
    <script type="text/javascript">
        window.onload = function() {
            var btn = document.getElementById('btn');
            var cnts = document.querySelectorAll('.cnt');
            btn.style.display = 'block';

            var now = 0;
            var count = ${images.length};
            var isPlay = false;
            var times = [${times.join(', ')}];
            btn.onclick = function() {
                if (isPlay) return;

                isPlay = true;
                cnts[now].style.zIndex = 10;
                now = 0;
                cnts[now].style.zIndex = 30;

                var next = function(index) {
                    setTimeout(function() {
                        cnts[now].style.zIndex = now === 0 ? 20 : 10;
                        now++;

                        if (now >= count) now = 0;
                        cnts[now].style.zIndex = 30;

                        next(now);
                    }, times[index]);
                };

                next(0);
            };
        };
    </script>
`;

let html = gen(tpl, {
    str,
    script,
    width: gif.width,
    height: gif.height
});

fs.writeFileSync(__dirname + '/./out.html', html, {encoding: 'utf8'})
