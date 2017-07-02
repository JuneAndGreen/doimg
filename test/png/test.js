'use strict';

const fs = require('fs');
const gen = require('tooltpl').generate;
const Png = require('../../index').Png;

let file = fs.readFileSync(__dirname + '/./test.png');
// let file = fs.readFileSync(__dirname + '/./test_adam7.png');
// let file = fs.readFileSync(__dirname + '/./test_png8_index.png');

let png = new Png(file);

let pixels = png.decode();

let str = '';

for(let i=0; i<png.width; i++) {
    str += '<div class="cloumn">';
    for(let j=0; j<png.height; j++) {
        str += '<div class="item" style="background: rgba(' + pixels[i][j].join(',') + ')"></div>';
    }
    str += '</div>';
}

let tpl = fs.readFileSync(__dirname + '/./tpl.html', {encoding: 'utf8'});

let html = gen(tpl, {
    str,
    width: png.width,
    height: png.height
});

fs.writeFileSync(__dirname + '/./out.html', html, {encoding: 'utf8'})
