'use strict';

const fs = require('fs');
const gen = require('tooltpl').generate;
const Jpeg = require('../../index').Jpeg;

let file = fs.readFileSync(__dirname + '/./test.jpeg');

let jpeg = new Jpeg(file);

let pixels = jpeg.decode();
// console.log(pixels)

let str = '';

for (let i = 0; i < jpeg.width; i++) {
    str += '<div class="cloumn">';
    for (let j = 0; j < jpeg.height; j++) {
        str += '<div class="item" style="background: rgb(' + pixels[i][j].join(',') + ')"></div>';
    }
    str += '</div>';
}

let tpl = fs.readFileSync(__dirname + '/./tpl.html', { encoding: 'utf8' });

let html = gen(tpl, {
    str,
    width: jpeg.width,
    height: jpeg.height
});

fs.writeFileSync(__dirname + '/./out.html', html, { encoding: 'utf8' })
