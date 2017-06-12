'use strict';

const _ = require('./util');

const DEFAULT = {
    header: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
    header_87a: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    end: []
};

// http://giflib.sourceforge.net/whatsinagif/index.html

class Gif {
    constructor(options) {
        this.index = 0; // 解码游标
        this.dataChunks = []; // 图像数据chunk数组
        this.length = 0; // 数据总长度

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

        if(!onlyDecodeGifInfo) {
            this.decodeGCT(); // 解析全局颜色列表

            while(this.index < this.buffer.length) {
                // 继续解析其他数据块
                let type = this.decodeChunk();
                if(type === 'IEND') break;
            }

            this.decodeIDATChunks();
            return this.getPixels();
        }
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
        if(!_.equal(header, DEFAULT.header) && !_.equal(header, DEFAULT.header_87a)) {
            throw new Error('gif的签名信息不合法！')
        }

        this.header = header;
    }

    /**
     * 解析逻辑屏幕标志符（Logical Screen Descriptor）
     * http://giflib.sourceforge.net/whatsinagif/bits_and_bytes.html#logical_screen_descriptor_block
     * @return {Void}
     */
    decodeLCD() {
        let chunk = this.readBytes(7);

        this.width = _.readInt16(chunk); // 宽
        this.height = _.readInt16(chunk, 2); // 高

        let packedField = _.readInt8(chunk. 4);
        packedField = _.numberToArray(packedField);
        this.globalColorTableFlag = packedField[0]; // 全局颜色列表标志(Global Color Table Flag)，当置位时表示有全局颜色列表
        this.bitDepth = parseInt(`${packedField[1]}${packedField[2]}${packedField[3]}`, 2); // 颜色深度
        this.sortFlag = packedField[4]; // 分类标志(Sort Flag)，如果置位表示全局颜色列表分类排列
        this.globalColorTableSize = parseInt(`${packedField[5]}${packedField[6]}${packedField[7]}`, 2); // 全局颜色列表大小

        this.backgroundColorIndex = _.readInt8(chunk, 5); // 背景颜色（在全局颜色列表中的索引，如果没有全局颜色列表，该值没有意义）
        this.pixelAspectRadio = _.readInt8(chunk, 6); // 像素宽高比
    }

    /**
     * 解析全局颜色列表（Global Color Table）
     * http://giflib.sourceforge.net/whatsinagif/bits_and_bytes.html#global_color_table_block
     * @return {Void}
     */
    decodeGCT() {
        if (this.globalColorTableFlag === 1) {
            let length = Math.pow(2, this.bitDepth + 1) * 3;
            let chunk = this.readBytes(length);

            this.globalColorTable = chunk;
        }
    }
}