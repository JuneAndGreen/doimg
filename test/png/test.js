'use strict';

const fs = require('fs');
const Png = require('../../src/png');

let file = fs.readFileSync(__dirname + '/./test.png');

let png = new Png(file);

console.log(png.width);
console.log(png.height);
