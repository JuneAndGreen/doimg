# doimg

一个简单的图片解码工具

但是未完成Orz……

## png解码器

```js
const Png = require('doimg').Png;

let png = new Png(buffer);

console.log(png.width); // 图像宽度
console.log(png.height); // 图像高度
console.log(png.bitDepth); // 图像深度，即每个通道包含的位数
console.log(png.colorType); // 颜色类型，0 - 灰度，2 - rgb，3 - 索引，4 - 灰度+aloha，6 - rgba
console.log(png.compressionMethod); // 压缩方法，值固定为0
console.log(png.filterMethod); // 过滤器方法，值固定为0
console.log(png.interlaceMethod); // 扫描方法，0 - 逐行扫描，1 - Adam7隔行扫描
console.log(png.colors); // 通道数
console.log(png.alpha); // 是否使用alpha通道
console.log(png.palette); // 索引色板

let pixels = png.decode(); // 像素数据
```

## gif解码器

```js
const Gif = require('doimg').Gif;

let gif = new Gif(buffer);

console.log(gif.width); // 图像宽度
console.log(gif.height); // 图像高度
console.log(gif.bitDepth); // 图像深度
console.log(gif.globalColorTableFlag); // 全局索引色板标志，1 - 存在全局索引色板
console.log(gif.sortFlag); // 分类标志，1 - 全局索引色板分类排列
console.log(gif.globalColorTableSize); // 全局索引色板大小
console.log(gif.backgroundColorIndex); // 背景颜色
console.log(gif.pixelAspectRadio); // 像素宽高比
console.log(gif.globalColorTable); // 全局索引色板

let images = png.decode(); // 图片列表像素数据
let firstImg = images[0]; // 取图片列表中第一张

console.log(firstImg.left); // 图像左边偏移
console.log(firstImg.top); // 图像上边偏移
console.log(firstImg.width); // 图像宽度
console.log(firstImg.height); // 图像高度
console.log(firstImg.localColorTableFlag); // 局部索引色板标志，1 - 存在局部索引色板
console.log(firstImg.interlaceFlag); // 扫描方式，0 - 逐行扫描，1 - 隔行扫描
console.log(firstImg.sortFlag); // 分类标志，1 - 局部索引色板分类排列
console.log(firstImg.sizeOfLocalColorTable); // 局部颜色列表大小
console.log(firstImg.disposalMethod); // 处置方法，0 - 不使用处置方法，1 - 不处置图形，把图形从当前位置移去，2 - 回复到背景色，3 - 回复到先前状态，4-7 - 自定义
console.log(firstImg.userInputFlag); // 用户输入标志，指出是否期待用户有输入之后才继续进行下去，0 - 不期待，1 - 期待
console.log(firstImg.transparentColorFlag); // 透明颜色标志
console.log(firstImg.delayTime); // 延迟时间，单位1／100秒
console.log(firstImg.transparentColorIndex); // 透明颜色索引
```

## 协议

MIT
