# doimg

一个简单的图片解码工具

## png解码器

```js
const Png = require('doimg').Png;

let png = new Png(buffer);

console.log(png.width); // 图像宽度
console.log(png.height); // 图像高度
console.log(png.bitDepth); // 图像深度，即每个通道包含的位数
console.log(png.colorType); // 颜色类型，0 - 灰度，2 - rgb，3 - 索引，4 - 灰度+aloha，6 - rgba
console.log(png.alpha); // 是否使用alpha通道

let pixels = png.decode(); // 像素数据
```

## gif解码器

```js
const Gif = require('doimg').Gif;

let gif = new Gif(buffer);

console.log(gif.width); // 图像宽度
console.log(gif.height); // 图像高度
console.log(gif.bitDepth); // 图像深度
console.log(gif.backgroundColorIndex); // 背景颜色

let images = png.decode(); // 图片列表像素数据
let firstImg = images[0]; // 取图片列表中第一张

console.log(firstImg.left); // 图像左边偏移
console.log(firstImg.top); // 图像上边偏移
console.log(firstImg.width); // 图像宽度
console.log(firstImg.height); // 图像高度
console.log(firstImg.disposalMethod); // 处置方法，0 - 不使用处置方法，1 - 不处置图形，把图形从当前位置移去，2 - 回复到背景色，3 - 回复到先前状态
console.log(firstImg.userInputFlag); // 用户输入标志，指出是否期待用户有输入之后才继续进行下去，0 - 不期待，1 - 期待
console.log(firstImg.delayTime); // 延迟时间，单位1／100秒
```

## jpeg解码器

```js
const Jpeg = require('doimg').Jpeg;

let jpeg = new Jpeg(buffer);

console.log(jpeg.width); // 图像宽度
console.log(jpeg.height); // 图像高度
console.log(jpeg.thumbnailWidth); // 缩略图宽度
console.log(jpeg.thumbnailHeight); // 缩略图高度
console.log(jpeg.thumbnail); // 缩略图数据

let pixels = jpeg.decode(); // 像素数据
```

## 协议

MIT
