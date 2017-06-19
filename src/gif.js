'use strict';

const _ = require('./util');

const DEFAULT = {
    header_89a: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
    header_87a: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    end: 0x3B
};

class Gif {
    constructor(options) {
        this.index = 0; // 解码游标
        this.images = [];

        let optionsType = _.getType(options);

        // 传入buffer数组，则做解码用
        if(optionsType === 'string') {
            this.buffer = _.stringToBuffer(options);
        } else if(optionsType === 'uint8array') {
            this.buffer = new Uint8Array(options);
        }

        // 传入对象，则做编码用
        if(optionsType === 'object') {
            this.options = options;
        }

        if(this.buffer) this.decode(true); // 预解码
    }

    /**
     * 读取buffer数组的指定字节数
     * @param  {Number} length 读取长度
     * @return {Array}         读取到的数据
     */
    readBytes(length) {
        let buffer = _.readBytes(this.buffer, this.index, length);
        this.index += length;

        return buffer;
    }

    /**
     * 编码
     * @return {Void}
     */
    encode() {
        if(!this.options) {
            throw new Error('不存在待编码数据！');
        }

        // TODO
    }

    /**
     * 解码
     * @param  {Boolean}  onlyDecodeGifInfo  是否只解析gif的基本信息
     * @return {Array}                       像素数组
     */
    decode(onlyDecodeGifInfo) {
        if(!this.buffer) {
            throw new Error('不存在待解码数据！');
        }

        this.decodeHeader(); // 解析头部信息

        this.decodeLCD(); // 解析逻辑屏幕标志符

        if(!onlyDecodeGifInfo && !this.hasDecode) {
            this.decodeGCT(); // 解析全局颜色列表

            while (!this.isEnd()) {
                let image = this.decodeSubImage();

                if (image) this.images.push(image);
            }

            this.hasDecode = true;
            return this.images;
        }
    }

    /**
     * 判断事否已到文件末尾
     * @return {Boolean} 判断结果
     */
    isEnd() {
        return _.readInt8(this.buffer, this.index) === DEFAULT.end;
    }

    /**
     * 解码头部信息
     * http://giflib.sourceforge.net/whatsinagif/bits_and_bytes.html#header_block
     * @return {Void}
     */
    decodeHeader() {
        if(this.header) return;

        if(this.index !== 0) {
            throw new Error('gif的index属性指向非0！');
        }

        let header = this.readBytes(6);
        if(_.equal(header, DEFAULT.header_89a)) {
            this.is89a = true;
        } else if (_.equal(header, DEFAULT.header_87a)) {
            this.is87a = true;
        } else {
            throw new Error('gif的签名信息不合法！');
        }

        this.header = header;
    }

    /**
     * 解析逻辑屏幕标志符（Logical Screen Descriptor）
     * http://giflib.sourceforge.net/whatsinagif/bits_and_bytes.html#logical_screen_descriptor_block
     * @return {Void}
     */
    decodeLCD() {
        if (this.hasDecodeLCD) return;

        let chunk = this.readBytes(7);

        this.width = parseInt(_.numberToString(_.readInt8(chunk, 1)) + _.numberToString(_.readInt8(chunk)), 2); // 宽
        this.height = parseInt(_.numberToString(_.readInt8(chunk, 3)) + _.numberToString(_.readInt8(chunk, 2)), 2); // 高

        let packedField = _.readInt8(chunk, 4);
        packedField = _.numberToArray(packedField);
        this.globalColorTableFlag = packedField[0]; // 全局颜色列表标志(Global Color Table Flag)，当置位时表示有全局颜色列表
        this.bitDepth = parseInt(`${packedField[1]}${packedField[2]}${packedField[3]}`, 2); // 颜色深度
        this.sortFlag = packedField[4]; // 分类标志(Sort Flag)，如果置位表示全局颜色列表分类排列
        this.globalColorTableSize = parseInt(`${packedField[5]}${packedField[6]}${packedField[7]}`, 2); // 全局颜色列表大小

        this.backgroundColorIndex = _.readInt8(chunk, 5); // 背景颜色（在全局颜色列表中的索引，如果没有全局颜色列表，该值没有意义）
        this.pixelAspectRadio = _.readInt8(chunk, 6); // 像素宽高比

        this.hasDecodeLCD = true;
    }

    /**
     * 解析全局颜色列表（Global Color Table）
     * http://giflib.sourceforge.net/whatsinagif/bits_and_bytes.html#global_color_table_block
     * @return {Void}
     */
    decodeGCT() {
        if (this.globalColorTableFlag === 1) {
            let length = Math.pow(2, this.globalColorTableSize + 1) * 3;
            let chunk = this.readBytes(length);

            this.globalColorTable = chunk;
        }
    }

    /**
     * 解析子图像
     * @return {Void}
     */
    decodeSubImage() {
        let applicationExtension = this.decodeAE(); // 解析应用扩展块
        let commentExtension = this.decodeCE(); // 解析注释扩展块

        if (!applicationExtension && !commentExtension) {
            let graphicsControlExtension = this.decodeGCE(); // 解析图形控制扩展
            var plainTextExtension = this.decodePTE(); // 解析文本扩展块

            if (!plainTextExtension) {
                // 解析图形数据
                let imageDescriptor = this.decodeID(); // 解析图像标识符
                let localColorTable;

                if (imageDescriptor.localColorTableFlag === 1) {
                    localColorTable = this.decodeLCT(imageDescriptor.sizeOfLocalColorTable); // 解析局部颜色列表
                }

                return this.decodeDataBlocks(imageDescriptor, localColorTable, graphicsControlExtension);
            }
        }
    }

    /**
     * 解析图形控制扩展（Graphics Control Extension），89a版本可选，在图像标识符或文本扩展块前面
     * http://giflib.sourceforge.net/whatsinagif/bits_and_bytes.html#graphics_control_extension_block
     * @return {Object}                          图形控制扩展
     * @property {Number} disposalMethod         处置方法，0 - 不使用处置方法，1 - 不处置图形，把图形从当前位置移去，2 - 回复到背景色，3 - 回复到先前状态，4-7 - 自定义
     * @property {Number} userInputFlag          用户输入标志，指出是否期待用户有输入之后才继续进行下去，1表示期待，0表示不期待
     * @property {Number} transparentColorFlag   透明颜色标志
     * @property {Number} delayTime              延迟时间，单位1/100秒，如果值不为1，表示暂停规定的时间后再继续往下处理数据流
     * @property {Number} transparentColorIndex  透明颜色索引
     */
    decodeGCE() {
        if (this.is87a) return;

        if (_.readInt8(this.buffer, this.index) === 0x21 && _.readInt8(this.buffer, this.index + 1) === 0xF9) {
            let chunk = this.readBytes(8);

            let packedField = _.readInt8(chunk, 3);
            packedField = _.numberToArray(packedField);

            return {
                disposalMethod: parseInt(`${packedField[3]}${packedField[4]}${packedField[5]}`, 2),
                userInputFlag: packedField[6],
                transparentColorFlag: packedField[7],

                delayTime: _.readInt16(chunk, 4),
                transparentColorIndex: _.readInt8(chunk, 6) 
            }
        }
    }

    /**
     * 解析图像标识符（Image Descriptor）
     * http://giflib.sourceforge.net/whatsinagif/bits_and_bytes.html#image_descriptor_block
     * @return {Object}  图像标识符
     * @property {Number} width                  图像宽度
     * @property {Number} height                 图像高度
     * @property {Number} localColorTableFlag    局部颜色列表标志，1表示紧接在图象标识符之后有一个局部颜色列表，供紧跟在它之后的一幅图象使用；0表示使用全局颜色列表
     * @property {Number} interlaceFlag          扫描方式，1表示隔行扫描，0表示顺序扫描
     * @property {Number} sortFlag               分类标志，1表示紧跟着的局部颜色列表分类排列
     * @property {Number} sizeOfLocalColorTable  局部颜色列表大小，其值+1就为颜色列表的位数
     */
    decodeID() {
        if (_.readInt8(this.buffer, this.index) === 0x2c) {
            let chunk = this.readBytes(10);

            let packedField = _.readInt8(chunk, 9);
            packedField = _.numberToArray(packedField);

            return {
                left: _.readInt16(chunk, 1),
                top: _.readInt16(chunk, 3),
                width: parseInt(_.numberToString(_.readInt8(chunk, 6)) + _.numberToString(_.readInt8(chunk, 5)), 2),
                height: parseInt(_.numberToString(_.readInt8(chunk, 8)) + _.numberToString(_.readInt8(chunk, 7)), 2),

                localColorTableFlag: packedField[0],
                interlaceFlag: packedField[1],
                sortFlag: packedField[2],

                sizeOfLocalColorTable: parseInt(`${packedField[5]}${packedField[6]}${packedField[7]}`, 2)
            };
        }
    }

    /**
     * 解析局部颜色列表（Local Color Table）
     * http://giflib.sourceforge.net/whatsinagif/bits_and_bytes.html#local_color_table_block
     * @param  {Number} sizeOfLocalColorTable  从图像标识符获取的颜色数信息
     * @return {Array}  颜色块信息
     */
    decodeLCT(sizeOfLocalColorTable) {
        let length = Math.pow(2, sizeOfLocalColorTable + 1) * 3;
        let chunk = this.readBytes(length);

        return chunk;
    }

    /**
     * 解析文本扩展块（Plain Text Extension），89a版本可选，因为几乎没有浏览器和应用支持，解析时可忽略
     * http://giflib.sourceforge.net/whatsinagif/bits_and_bytes.html#plain_text_extension_block
     * @return {Boolean} 是否存在文本扩展块
     */
    decodePTE() {
        if (this.is87a) return false;

        if (_.readInt8(this.buffer, this.index) === 0x21 && _.readInt8(this.buffer, this.index + 1) === 0x01) {
            this.readBytes(2); // 移动index
            
            let blockSize = this.readBytes(1)[0];
            this.readBytes(blockSize); // 跳过文本扩展块配置

            let next = this.readBytes(1)[0];

            while (next) {
                this.readBytes(next); // 读取数据块，此处不作任何处理

                next = this.readBytes(1)[0];
            }

            return true;
        }

        return false;
    }

    /**
     * 解析应用扩展块（Application Extension），89a版本可选，供应用存放数据的地方，解析时可忽略
     * http://giflib.sourceforge.net/whatsinagif/bits_and_bytes.html#application_extension_block
     * @return {Boolean} 是否存在应用扩展块
     */
    decodeAE() {
        if (this.is87a) return false;

        if (_.readInt8(this.buffer, this.index) === 0x21 && _.readInt8(this.buffer, this.index + 1) === 0xFF) {
            this.readBytes(2); // 移动index
            
            let blockSize = this.readBytes(1)[0];
            this.readBytes(blockSize); // 跳过应用扩展块配置

            let next = this.readBytes(1)[0];

            while (next) {
                this.readBytes(next); // 读取数据块，此处不作任何处理

                next = this.readBytes(1)[0];
            }

            return true;
        }

        return false;
    }

    /**
     * 解析注释扩展块（Comment Extension），89a版本可选，此扩展块可忽略
     * http://giflib.sourceforge.net/whatsinagif/bits_and_bytes.html#comment_extension_block
     * @return {Boolean} 是否存在注释扩展块
     */
    decodeCE() {
        if (this.is87a) return false;

        if (_.readInt8(this.buffer, this.index) === 0x21 && _.readInt8(this.buffer, this.index + 1) === 0xFE) {
            this.readBytes(2); // 移动index

            let next = this.readBytes(1)[0];

            while (next) {
                this.readBytes(next); // 读取数据块，此处不作任何处理

                next = this.readBytes(1)[0];
            }

            return true;
        }

        return false;
    }

    /**
     * 解析数据块
     * http://giflib.sourceforge.net/whatsinagif/bits_and_bytes.html#image_data_block
     * @param {Object} imageDescriptor          图形标识符
     * @param {Object} localColorTable          局部颜色列表
     * @param {Object} graphicsControlExtension 图形控制扩展
     * @return {Object}                         图片信息
     */
    decodeDataBlocks(imageDescriptor, localColorTable, graphicsControlExtension = {}) {
        let LZWMinimumCodeSize = this.readBytes(1)[0];

        let buffer = [];

        let next = this.readBytes(1)[0];

        while (next) {
            buffer = buffer.concat(Array.from(this.readBytes(next))); // 读取数据块

            next = this.readBytes(1)[0];
        }


        // LZW解压缩
        let output = this.lzwDecode(LZWMinimumCodeSize, buffer);

        // 转换像素色值
        let colorTable = localColorTable || this.globalColorTable;
        let pixelsBuffer = [];
        output.forEach(index => {
            index = parseInt(index, 10);

            // rgba 色值
            pixelsBuffer.push([
                colorTable[index * 3],
                colorTable[index * 3 + 1],
                colorTable[index * 3 + 2],
                1
            ]);
        });

        // 扫描图片
        let width = imageDescriptor.width || this.width;
        let height = imageDescriptor.height || this.height;
        let pixels = new Array(width);

        if (imageDescriptor.interlaceFlag) {
            // 隔行扫描
            for (let i = 0; i < width; i++) {
                pixels[i] = new Array(height);
            }

            let start = [0, 4, 2, 1];
            let inc = [8, 8, 4, 2];
            let index = 0;
            for (let pass = 0; pass < 4; pass++) {
                for (let i = start[pass]; i < height; i += inc[pass]) {
                    let scanline = pixelsBuffer.slice(index, index + width);
                    index = index + width;
                    for (let j = 0; j < width; j++) {
                        pixels[j][i] = scanline[j];
                    }
                }
            }
        } else {
            // 顺序扫描
            for (let i = 0; i < width; i++) {
                pixels[i] = new Array(height);

                for (let j = 0; j < height; j++) {
                    pixels[i][j] = pixelsBuffer[j * width + i];
                }
            }
        }

        imageDescriptor.pixels = pixels;
        return imageDescriptor;
    }

    /**
     * lzw解压缩
     * @param {Number} dataBits 即LZWMinimumCodeSize
     * @param {Array}  buffer   buffer数组
     * @return {Array}          index数组
     */
    lzwDecode(dataBits, buffer) {
        const MAX_DICT = 4096;

        let cc = Math.pow(2, dataBits);
        let eoi = cc + 1;
        let avail = cc + 2; // 编译表中下一个插入code的位置

        let codeSize = dataBits + 1;
        let codeMask = Math.pow(2, codeSize) - 1; // 掩码

        let lastCode = -1; // 上一个code
        let firstChar = 0;
        let data = 0; // 可用数据
        let bits = 0; // 可用位数
        let isDone = false;

        let prefix = new Uint16Array(MAX_DICT);
        let codeTable = new Uint8Array(MAX_DICT);
        let codeTableLength = new Uint16Array(MAX_DICT);
        for (let i = 0; i < cc; i++) {
            codeTable[i] = i;
            codeTableLength[i] = 1;
        }

        let outputSize = 1024;
        let output = Buffer.alloc(outputSize + MAX_DICT);
        let pos = 0;

        let indexs = Buffer.alloc(0);

        for (let i = 0, len = buffer.length; i < len; i++) {
            if (isDone) break;

            let byte = buffer[i];

            // 补充字节，http://giflib.sourceforge.net/whatsinagif/lzw_image_data.html#lzw_bytes
            data |= byte << bits;
            bits += 8;

            while (bits >= codeSize) {
                // 读取当前的code
                let code = data & codeMask;
                data >>= codeSize; // 移除掉已读取的code
                bits -= codeSize; // 移除掉已读取的位数

                if (code === cc) {
                    // 重新初始化编译表
                    codeSize = dataBits + 1;
                    codeMask = Math.pow(2, codeSize) - 1;
                    avail = cc + 2;
                    lastCode = -1;
                    continue;
                }

                if (code === eoi) {
                    // 读取到结束code
                    isDone = true;
                    break;
                }

                let c = code;
                let codeLength = 0;

                if (code < avail) {
                    // 已经存在code
                    codeLength = codeTableLength[code];
                    pos += codeLength;
                } else if (code === avail && lastCode !== -1) {
                    // 需要被插入到编译表中到新code
                    codeLength = codeTableLength[lastCode] + 1;
                    code = lastCode;
                    pos += codeLength;
                    output[--pos] = firstChar;
                } else {
                    throw new Error('不合法的 LZW code！');
                }

                // 追加前缀
                while (code >= cc) {
                    output[--pos] = codeTable[code];
                    code = prefix[code];
                }

                output[--pos] = firstChar = codeTable[code];

                if (avail < MAX_DICT && lastCode !== -1) {
                    prefix[avail] = lastCode;
                    codeTable[avail] = firstChar;
                    codeTableLength[avail] = codeTableLength[lastCode] + 1;

                    // 已经用完当前codeSize确定的位数，需要继续扩展位数
                    if (++avail < MAX_DICT && !(avail & codeMask)) {
                        codeSize++;
                        codeMask += avail;
                    }
                }

                lastCode = c;
                pos += codeLength;

                if (pos >= outputSize) {
                    // 将已经解析道道数据易到输出列表中
                    indexs = Buffer.concat([indexs, Buffer.from(output.slice(0, outputSize))]);

                    // 移除已解析的字节
                    output.copy(output, 0, outputSize);
                    pos -= outputSize;
                }
            }

        }

        // 剩余数据直接拷贝过去
        if (pos > 0) {
            indexs = Buffer.concat([indexs, output.slice(0, pos)]);
        }

        return indexs;
    }
}

module.exports = Gif;
