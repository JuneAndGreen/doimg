'use strict';

const _ = require('./util');

const DEFAULT = {
    header: [0xff, 0xd8],
    end: [0xff, 0xd9]
};

// 亮度量化表
const B_QUANTIZATION_TABLE = [
    16, 12, 14, 14, 18,  24,  49,  72,
    11, 12, 13, 17, 22,  35,  64,  92,
    10, 14, 16, 22, 37,  55,  78,  95,
    16, 19, 24, 29, 56,  64,  87,  98,
    24, 26, 40, 51, 68,  81,  103, 112,
    40, 58, 57, 87, 109, 104, 121, 100,
    51, 60, 69, 80, 103, 113, 120, 103,
    61, 55, 56, 62, 77,  92,  101, 99,
];

// 色度量化表
const C_QUANTIZATION_TABLE = [
    17, 18, 24, 47, 99, 99, 99, 99,
    18, 21, 26, 66, 99, 99, 99, 99,
    24, 26, 56, 99, 99, 99, 99, 99,
    47, 66, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99,
];

// 用于快速计算ACT变换
const C1 = Math.cos(Math.PI / 16);
const C2 = Math.cos(Math.PI / 8);
const C3 = Math.cos(3 * Math.PI / 16);
const C4 = Math.cos(Math.PI / 4);
const C5 = Math.cos(5 * Math.PI / 16);
const C6 = Math.cos(3 * Math.PI / 8);
const C7 = Math.cos(7 * Math.PI / 16);

// 用于进行zig-zag编码
const ZIG_ZAG = [
    0,  1,  5,  6,  14, 15, 27, 28,
    2,  4,  7,  13, 16, 26, 29, 42,
    3,  8,  12, 17, 25, 30, 41, 43,
    9,  11, 18, 24, 31, 40, 44, 53,
    10, 19, 23, 32, 39, 45, 52, 54,
    20, 22, 33, 38, 46, 51, 55, 60,
    21, 34, 37, 47, 50, 56, 59, 61,
    35, 36, 48, 49, 57, 58, 62, 63,
];

class Jpeg {
    constructor(options) {
        this.index = 0; // 解码游标
        this.data = []; // 图像数据

        let optionsType = _.getType(options);

        // 传入buffer数组，做解码用
        if (optionsType === 'uint8array') {
            this.buffer = new Uint8Array(options);
        }

        if (this.buffer) this.decode(true); // 预解码
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
     * 解码
     *
     * 参考：
     * https://www.w3.org/Graphics/JPEG/itu-t81.pdf
     * http://www.codingnow.com/2000/download/jpeg.txt
     * https://www.ibm.com/developerworks/cn/linux/l-cn-jpeg/
     * 
     * @param  {Boolean}  onlyDecodeJpegInfo  是否只解析jpeg的基本信息
     * @return {Array}                       像素数组
     */
    decode(onlyDecodeJpegInfo) {
        let buffer = this.buffer;
        if (!buffer) {
            throw new Error('不存在待解码数据！');
        }

        this.decodeSOI(); // 解析头部信息

        let data = [];
        while (this.index < buffer.length) {
            let byte = this.readBytes(1)[0];

            if (byte === 0xff) {
                // 遇到特殊标记，需要特殊解析
                let next = _.readInt8(this.buffer, this.index);

                if (next === 0x00) {
                    // 图像里的一部分
                    this.readBytes(1); // 跳过next
                    if (this.beginToCollectData) data.push(byte);
                } else if (next === 0xff) {
                    // 跳过上一个0xff
                    continue;
                } else if(next >= 0xd0 && next <= 0xd7) {
                    // 遇到RSTn标记
                    this.readBytes(1); // 跳过next

                    this.data.push({
                        type: next & 0x0f,
                        chunk: data
                    });
                    data = [];
                } else {
                    // 其他标记码
                    this.decodeMarkerSegment();
                }
            } else {
                if (this.beginToCollectData) data.push(byte);
            }
        }

        if (data.length) {
            // 填入最后一块数据
            this.data.push({
                type: 'end',
                chunk: data
            });
        }

        if (!onlyDecodeJpegInfo) {
            if (this.pixels) return this.pixels;

            // 解析jpeg图像
            return this.decodeImageData();
        }
    }

    /**
     * 解码SOI，Start of Image，即文件头
     * @return {Void}
     */
    decodeSOI() {
        if (this.header) return;

        if (this.index !== 0) {
            throw new Error('jpeg的index属性指向非0！');
        }

        let header = this.readBytes(2);
        if (!_.equal(header, DEFAULT.header)) {
            throw new Error('jpeg的SOI不合法！');
        }

        this.header = header;
    }

    /**
     * 解码标记段
     * https://www.w3.org/TR/PNG/#5Chunk-layout
     *
     * 段格式：
     * 段标识 | 1字节 | 每个新段的开始标识，固定为0xff
     * 段类型 | 1字节 | 类型编码（称作“标记码”）
     * 段长度 | 2字节 | 包括段内容和段长度本身,不包括段标识和段类型
     * 段内容 | ≤65533字节
     * 
     * @return {String} 数据块类型
     */
    decodeMarkerSegment() {
        let marker = this.readBytes(1)[0]; // 标记码

        if (_.equal([0xff, marker], DEFAULT.end)) {
            // 已解析到文件末尾
            return;
        }

        let length = _.readInt16(this.readBytes(2)); // 数据块长度
        let chunkData = this.readBytes(length - 2); // 因为长度包含了存放长度的两个字节，故要-2

        switch (marker) {
            case 0xc0:
                this.decodeSOF0(chunkData);
                break;
            case 0xc4:
                this.decodeDHT(chunkData);
                break;
            case 0xda:
                this.decodeSOS(chunkData);
                break;
            case 0xdb:
                this.decodeDQT(chunkData);
                break;
            case 0xdd:
                this.decodeDRI(chunkData);
                break;
            case 0xe0:
                this.decodeAPP0(chunkData);
                break;
            case 0xfe:
                this.decodetCOM(chunkData);
                break;
        }
    }

    /**
     * 解码APP0，Application，应用程序保留标记0
     * @param  {Array} chunk 标记段数据
     */
    decodeAPP0(chunk) {
        this.format = _.bufferToString(_.readBytes(chunk, 0, 5)); // 文件交换格式，通常是JFIF，JPEG File Interchange Format的缩写
        this.mainVersion = _.readInt8(chunk, 5); // 主版本号
        this.subVersion = _.readInt8(chunk, 6); // 次版本号

        this.unit = _.readInt8(chunk, 7); // 密度单位，0 - 无单位，1 - 点数/英寸，2 - 点数/厘米
        this.xPixel = _.readInt16(chunk, 8); // 水平方向像素密度
        this.yPixel = _.readInt16(chunk, 10); // 垂直方向像素密度

        this.thumbnailWidth = _.readInt8(chunk, 12); // 缩略图宽度
        this.thumbnailHeight = _.readInt8(chunk, 13); // 缩略图高度

        if (this.thumbnailWidth > 0 && this.thumbnailHeight > 0 && chunk.length > 14) {
            // 读取缩略图数据
            let thumbnail = chunk.slice(14);
            let data = [];
            for (let i = 0; i < this.thumbnailWidth; i++) {
                data[i] = [];
                for (let j = 0; j < this.thumbnailHeight; j++) {
                    let index = j * this.thumbnailWidth + i;

                    data[i][j] = [
                        thumbnail[index],
                        thumbnail[index + 1],
                        thumbnail[index + 2],
                    ];
                }
            }

            this.thumbnail = data;
        }
    }

    /**
     * 解码SOF0，Start of Frame，帧图像开始
     * @param  {Array} chunk 标记段数据
     */
    decodeSOF0(chunk) {
        this.accuracy = _.readInt8(chunk, 0); // 样本精度，通常值为8，样本就是单个像素的颜色分量
        this.height = _.readInt16(chunk, 1); // 图片高度
        this.width = _.readInt16(chunk, 3); // 图片宽度

        this.colorComponentCount = _.readInt8(chunk, 5); // 颜色分量数，1 - 灰度图，3 - YCrCb/YIQ 彩色图，4 - CMYK 彩色图，通常值为3

        if (this.colorComponentCount !== 3) {
            throw new Error('仅支持解析YCrCb彩色图！');
        }

        // 读取每个颜色分量的信息
        chunk = chunk.slice(6);
        this.colorComponent = [];
        for (let i = 0; i < this.colorComponentCount; i++) {
            let colorComponentId = _.readInt8(chunk, 0); // 颜色分量id，1 - Y，2 - Cb，3 - Cr，4 - I，5 - Q

            let packedField = _.readInt8(chunk, 1);
            packedField = _.numberToArray(packedField);
            let x = parseInt(`${packedField[0]}${packedField[1]}${packedField[2]}${packedField[3]}`, 2); // 水平采样系数
            let y = parseInt(`${packedField[4]}${packedField[5]}${packedField[6]}${packedField[7]}`, 2); // 垂直采样系数

            let QTId = _.readInt8(chunk, 2); // 量化表id

            this.colorComponent[colorComponentId] = { x, y, QTId };

            chunk = chunk.slice(3);
        }

        this.hmax = 1; // mcu宽度
        this.vmax = 1; // mcu高度
        this.readDuSeq = []; // 读取的mcu里数据单元的顺序，通常为Y-Y-Y-Y-Cb-Cr
        this.colorComponent.forEach((item, index) => {
            if (item) {
                for (let i = 0; i < item.x * item.y; i++) {
                    this.readDuSeq.push(index);
                }

                if (item.x > this.hmax) this.hmax = item.x;
                if (item.y > this.vmax) this.vmax = item.y;
            }
        });
    }

    /**
     * 解码DHT，Difine Huffman Table，定义哈夫曼表
     * @param  {Array} chunk 标记段数据
     */
    decodeDHT(chunk) {
        this.HT = this.HT || {};
        while (chunk.length) {
            let packedField = _.readInt8(chunk, 0);
            packedField = _.numberToArray(packedField);

            let type = packedField[3]; // 哈夫曼表类型，0 - DC直流表，1 - AC交流表
            let id = packedField[7]; // 哈夫曼表id

            let length = 0;
            let countArray = [];
            for (let i = 0; i < 16; i++) {
                let count = _.readInt8(chunk, i + 1);

                countArray.push(count);
                length += count;
            }
            let data = _.readBytes(chunk, 17, length);

            this.HT[`${type}-${id}`] = {
                type,
                data: this.constructHuffmanTree(Array.from(data), countArray),
            };

            chunk = chunk.slice(length + 17);
        }
    }

    /**
     * 解码DQT，Define Quantization Table，定义量化表
     * @param  {Array} chunk 标记段数据
     */
    decodeDQT(chunk) {
        this.QT = this.QT || {};
        while (chunk.length) {
            let packedField = _.readInt8(chunk, 0);
            packedField = _.numberToArray(packedField);


            let accuracy = parseInt(`${packedField[0]}${packedField[1]}${packedField[2]}${packedField[3]}`, 2); // 量化表精度，0 - 1字节，1 - 2字节
            let id = parseInt(`${packedField[4]}${packedField[5]}${packedField[6]}${packedField[7]}`, 2); // 量化表id，取值范围为0 - 3，所以最多可有4个量化表

            let length = 64 * (accuracy + 1);
            let data = _.readBytes(chunk, 1, length);

            this.QT[id] = {
                accuracy,
                data,
            };

            chunk = chunk.slice(length + 1);
        }
    }

    /**
     * 解码SOS，Start of Scan，扫描开始
     * @param  {Array} chunk 标记段数据
     */
    decodeSOS(chunk) {
        this.colors = _.readInt8(chunk, 0); // 1 - 灰度图，3 - YCrCb或YIQ，4 - CMYK

        chunk = chunk.slice(1);
        this.colorInfo = this.colorInfo || {};
        for (let i = 0; i < this.colors; i++) {
            let colorId = _.readInt8(chunk, 0); // 1 - Y，2 - Cb，3 - Cr，4 - I，5 - Q

            let packedField = _.readInt8(chunk, 1);
            packedField = _.numberToArray(packedField);

            let DCHTId = parseInt(`${packedField[0]}${packedField[1]}${packedField[2]}${packedField[3]}`, 2); // DC哈夫曼表id
            let ACHTId = parseInt(`${packedField[4]}${packedField[5]}${packedField[6]}${packedField[7]}`, 2); // AC哈夫曼表id

            this.colorInfo[colorId] = {
                DCHTId,
                ACHTId,
            };

            chunk = chunk.slice(2);
        }

        this.beginToCollectData = true; // 准备开始收集数据
    }

    /**
     * 解码DRI，Define Restart Interval，定义差分编码累计复位的间隔
     * @param  {Array} chunk 标记段数据
     */
    decodeDRI(chunk) {
        this.restartInterval = _.readInt16(chunk, 0);
    }

    /**
     * 解码COM，注释
     * @param  {Array} chunk 标记段数据
     */
    decodeCOM(chunk) {
        this.comment = chunk;
    }

    /**
     * 构建哈夫曼树
     * @param  {Array}  chunk       哈夫曼表数据
     * @param  {Array}  countArray  哈夫曼表中各个位数的编码个数
     * @return {Object}             构建出来的哈夫曼树
     */
    constructHuffmanTree(chunk, countArray) {
        let ret = {};

        let last;
        for (let i = 0, length = countArray.length; i < length; i++) {
            let count = countArray[i];
            for (let j = 0; j < count; j++) {
                if (last === undefined) {
                    // 初始化第一个编码
                    last = _.repeatString('0', i + 1);
                } else {
                    // 将上一个编码+1
                    let lastLength = last.length;
                    last = (parseInt(last, 2) + 1).toString(2);

                    if (last.length < lastLength) {
                        // 位数不够前置补0
                        last = _.repeatString('0', lastLength - last.length) + last;
                    }

                    if (last.length < i + 1) {
                        // 位数不够后置补0
                        last = last + _.repeatString('0', i + 1 - last.length);
                    }
                }

                ret[last] = {
                    group: last.length,
                    value: chunk.shift()
                };
            }
        }

        return ret;
    }

    /**
     * zig-zag编码
     *
     * @param  {Array}   input     输入数组
     * @param  {Boolean} isReverse 逆向操作
     * @return {Array}             返回数组
     */
    zigZag(input, isReverse) {
        let output = [];

        for (let i=0; i < 64; i++) {
            if (isReverse) {
                output[i] = input[ZIG_ZAG[i]];
            } else {
                output[ZIG_ZAG[i]] = input[i];
            }
        }

        return output;
    }

    /**
     * RGB 转 YCrCb
     * 
     * [ Y  ]   [ 0.299    0.587    0.244   ][ r ]   [ 0   ]
     * [ Cr ] = [ 0.5      -0.4187  -0.0813 ][ g ] + [ 128 ]
     * [ Cb ]   [ -0.1687  -0.3313  0.5     ][ b ]   [ 128 ]
     * 
     * @param  {Array} rgb rgb颜色模型
     * @return {Array}     YCrCb颜色模型
     */
    rgb2YCrCb(rgb) {
        return [
            0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2],
            0.5 * rgb[0] - 0.4187 * rgb[1] - 0.0813 * rgb[2] + 128,
            - 0.1687 * rgb[0] - 0.3313 * rgb[1] + 0.5 * rgb[2] + 128,
        ];
    }

    /**
     * YCrCb 转 RGB
     *
     * [ r ]   [ 1  1.402     0        ][ Y        ]
     * [ g ] = [ 1  -0.71414  -0.34414 ][ Cr - 128 ]
     * [ b ]   [ 1  0         1.772    ][ Cb - 128 ]
     * 
     * @param  {Array} YCrCb YCrCb颜色模型
     * @return {Array}       rgb颜色模型
     */
    YCrCb2rgb(YCrCb) {
        let r = YCrCb[0] + 1.402 * (YCrCb[1] - 128);
        let g = YCrCb[0] - 0.34414 * (YCrCb[2] - 128) - 0.71414 * (YCrCb[1] - 128);
        let b = YCrCb[0] + 1.772 * (YCrCb[2] - 128);

        return [
            r > 255 ? 255 : r < 0 ? 0 : ~~r,
            g > 255 ? 255 : g < 0 ? 0 : ~~g,
            b > 255 ? 255 : b < 0 ? 0 : ~~b,
        ];
    }

    /**
     * dct变换，因为有更快的变换算法，所以此算法仅供参考
     * @param  {Array}   input     输入矩阵
     * @param  {Boolean} isReverse 是否进行逆向变换
     * @return {Array}             输出矩阵
     */
    dct(input, isReverse) {
        let transform = []; // 变换矩阵
        let transformT = []; // 变换矩阵的转置矩阵

        // 初始化矩阵
        for (let i = 0; i < 8; i++) {
            transform[i] = [];
            transformT[i] = [];
        }

        // 生成变换矩阵
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                let a = j === 0 ? Math.sqrt(1 / 8) : Math.sqrt(2 / 8);

                transform[i][j] = a * Math.cos(Math.PI * (i + 0.5) * j / 8);
                transformT[j][i] = transform[i][j];
            }
        }

        if (!isReverse) return _.multiplyMatrix(_.multiplyMatrix(transform, input), transformT);
        else return _.multiplyMatrix(_.multiplyMatrix(transformT, input), transform);
    }

    /**
     * 快速dct变换
     * @param  {Array}   input     输入矩阵
     * @return {Array}             输出矩阵
     */
    fastDct(input) {
        let output = [];

        // 初始化矩阵
        for (let i = 0; i < 8; i++) {
            output[i] = [];
            for (let j = 0; j < 8; j++) {
                output[i][j] = input[i][j];
            }
        }

        // 行变换
        for (let i = 0; i < 8; i++) {
            let tmp0 = output[0][i] + output[7][i];
            let tmp1 = output[1][i] + output[6][i];
            let tmp2 = output[2][i] + output[5][i];
            let tmp3 = output[3][i] + output[4][i];
            let tmp4 = output[3][i] - output[4][i];
            let tmp5 = output[2][i] - output[5][i];
            let tmp6 = output[1][i] - output[6][i];
            let tmp7 = output[0][i] - output[7][i];
            let tmp10 = tmp0 + tmp3;
            let tmp11 = tmp1 + tmp2;
            let tmp12 = tmp1 - tmp2;
            let tmp13 = tmp0 - tmp3;

            output[0][i] = C4 * (tmp10 + tmp11) / 2;
            output[1][i] = (C1 * tmp7 + C3 * tmp6 + C5 * tmp5 + C7 * tmp4) / 2;
            output[2][i] = (C2 * tmp13 + C6 * tmp12) / 2;
            output[3][i] = (C3 * tmp7 - C7 * tmp6 - C1 * tmp5 - C5 * tmp4) / 2;
            output[4][i] = C4 * (tmp10 - tmp11) / 2;
            output[5][i] = (C5 * tmp7 - C1 * tmp6 + C7 * tmp5 + C3 * tmp4) / 2;
            output[6][i] = (C6 * tmp13 - C2 * tmp12) / 2;
            output[7][i] = (C7 * tmp7 - C5 * tmp6 + C3 * tmp5 - C1 * tmp4) / 2;
        }

        // 列变换
        for (let i = 0; i < 8; i++) {
            let tmp0 = output[i][0] + output[i][7];
            let tmp1 = output[i][1] + output[i][6];
            let tmp2 = output[i][2] + output[i][5];
            let tmp3 = output[i][3] + output[i][4];
            let tmp4 = output[i][3] - output[i][4];
            let tmp5 = output[i][2] - output[i][5];
            let tmp6 = output[i][1] - output[i][6];
            let tmp7 = output[i][0] - output[i][7];
            let tmp10 = tmp0 + tmp3;
            let tmp11 = tmp1 + tmp2;
            let tmp12 = tmp1 - tmp2;
            let tmp13 = tmp0 - tmp3;

            output[i][0] = C4 * (tmp10 + tmp11) / 2;
            output[i][1] = (C1 * tmp7 + C3 * tmp6 + C5 * tmp5 + C7 * tmp4) / 2;
            output[i][2] = (C2 * tmp13 + C6 * tmp12) / 2;
            output[i][3] = (C3 * tmp7 - C7 * tmp6 - C1 * tmp5 - C5 * tmp4) / 2;
            output[i][4] = C4 * (tmp10 - tmp11) / 2;
            output[i][5] = (C5 * tmp7 - C1 * tmp6 + C7 * tmp5 + C3 * tmp4) / 2;
            output[i][6] = (C6 * tmp13 - C2 * tmp12) / 2;
            output[i][7] = (C7 * tmp7 - C5 * tmp6 + C3 * tmp5 - C1 * tmp4) / 2;
        }

        return output;
    }

    /**
     * 快速逆dct变换
     * @param  {Array}   input     输入矩阵
     * @return {Array}             输出矩阵
     */
    fastIDct(input) {
        let output = [];

        // 初始化矩阵
        for (let i = 0; i < 8; i++) {
            output[i] = [];
            for (let j = 0; j < 8; j++) {
                output[i][j] = input[i][j];
            }
        }

        // 行变换
        for (let i = 0; i < 8; i++) {
            let tmp0 = (output[0][i] * C4 + output[2][i] * C2 + output[4][i] * C4 + output[6][i] * C6) / 2;
            let tmp1 = (output[0][i] * C4 + output[2][i] * C6 - output[4][i] * C4 - output[6][i] * C2) / 2;
            let tmp2 = (output[0][i] * C4 - output[2][i] * C6 - output[4][i] * C4 + output[6][i] * C2) / 2;
            let tmp3 = (output[0][i] * C4 - output[2][i] * C2 + output[4][i] * C4 - output[6][i] * C6) / 2;
            let tmp4 = (output[1][i] * C7 - output[3][i] * C5 + output[5][i] * C3 - output[7][i] * C1) / 2;
            let tmp5 = (output[1][i] * C5 - output[3][i] * C1 + output[5][i] * C7 + output[7][i] * C3) / 2;
            let tmp6 = (output[1][i] * C3 - output[3][i] * C7 - output[5][i] * C1 - output[7][i] * C5) / 2;
            let tmp7 = (output[1][i] * C1 + output[3][i] * C3 + output[5][i] * C5 + output[7][i] * C7) / 2;

            output[0][i] = tmp0 + tmp7;
            output[1][i] = tmp1 + tmp6;
            output[2][i] = tmp2 + tmp5;
            output[3][i] = tmp3 + tmp4;
            output[4][i] = tmp3 - tmp4;
            output[5][i] = tmp2 - tmp5;
            output[6][i] = tmp1 - tmp6;
            output[7][i] = tmp0 - tmp7;
        }

        // 列变换
        for (let i = 0; i < 8; i++) {  
            let tmp0 = (output[i][0] * C4 + output[i][2] * C2 + output[i][4] * C4 + output[i][6] * C6) / 2;
            let tmp1 = (output[i][0] * C4 + output[i][2] * C6 - output[i][4] * C4 - output[i][6] * C2) / 2;
            let tmp2 = (output[i][0] * C4 - output[i][2] * C6 - output[i][4] * C4 + output[i][6] * C2) / 2;
            let tmp3 = (output[i][0] * C4 - output[i][2] * C2 + output[i][4] * C4 - output[i][6] * C6) / 2;
            let tmp4 = (output[i][1] * C7 - output[i][3] * C5 + output[i][5] * C3 - output[i][7] * C1) / 2;
            let tmp5 = (output[i][1] * C5 - output[i][3] * C1 + output[i][5] * C7 + output[i][7] * C3) / 2;
            let tmp6 = (output[i][1] * C3 - output[i][3] * C7 - output[i][5] * C1 - output[i][7] * C5) / 2;
            let tmp7 = (output[i][1] * C1 + output[i][3] * C3 + output[i][5] * C5 + output[i][7] * C7) / 2;
 
            output[i][0] = tmp0 + tmp7;
            output[i][1] = tmp1 + tmp6;
            output[i][2] = tmp2 + tmp5;
            output[i][3] = tmp3 + tmp4;
            output[i][4] = tmp3 - tmp4;
            output[i][5] = tmp2 - tmp5;
            output[i][6] = tmp1 - tmp6;
            output[i][7] = tmp0 - tmp7;
        }

        return output;
    }

    /**
     * 量化
     * @param  {Array}   input             输入矩阵
     * @param  {Number}  colorComponentId  颜色分量id
     * @param  {Boolean} isReverse         是否进行逆向运算
     * @return {Array}                     输出矩阵
     */
    quantify(input, colorComponentId, isReverse) {
        let output = [];

        if (!isReverse) {
            // 量化
            let qt = C_QUANTIZATION_TABLE; // 默认为色度

            if (colorComponentId === 1) {
                // 亮度
                let qt = B_QUANTIZATION_TABLE
            }

            for (let i = 0; i < 64; i++) {
                output[i] = Math.round(input[i] / qt[i]);
            }
        } else {
            // 反量化
            let colorComponent = this.colorComponent[colorComponentId];
            let qt = this.QT[colorComponent.QTId].data;

            for (let i = 0; i < 64; i++) {
                output[i] = Math.round(input[i] * qt[i]);
            }
        }

        return output;
    }

    /**
     * 哈夫曼解码，包含游程编码解码的过程
     * @param  {Array}  input             输入buffer数组
     * @param  {Number} colorComponentId  颜色分量id
     * @param  {Number} lastDc            上一个dc值
     * @return {Object}                   输出数据
     */
    decodeHuffman(input, colorComponentId, lastDc = 0) {
        let cursor = 0;
        let output = [];

        for (let i = 0; i < 64; i++) {
            let ht = this.HT[`${i === 0 ? 0 : 1}-${this.colorInfo[colorComponentId][i === 0 ? 'DCHTId' : 'ACHTId']}`].data;
            let keys = Object.keys(ht);
            let value;
            for (let key of keys) {
                // 寻找对应的哈夫曼原值
                let length = key.length;
                let subBuffer;

                if (input.length >= cursor + length) {
                    subBuffer = input.slice(cursor, cursor + length);

                } else {
                    // 不够的位数用1填充
                    subBuffer = input.slice(cursor);
                    let temSubBuffer = Buffer.alloc(length - subBuffer.length, '1', 'utf8');

                    subBuffer = Buffer.concat([subBuffer, temSubBuffer], length);
                }

                if (subBuffer.toString() === key) {
                    cursor += length;
                    value = ht[key].value;
                    break;
                }
            }

            let bitCount;
            let bitData;
            // dc、ac数据的解法比较特殊，类似如下
            // 位数                值
            // 0                   0
            // 1                 -1, 1
            // 2             -3, -2, 2, 3
            // 3        -7, ..., -4, 4, ..., 7
            // 4       -15, ..., -8, 8, ..., 15
            if (i === 0) {
                // 取dc值
                bitCount = value; // 数据的位数

                if (!bitCount) {
                    bitData = 0;
                } else {
                    bitData = input.slice(cursor, cursor + bitCount).toString(); // 读出数据
                    bitData = parseInt(bitData, 2);

                    let half = Math.pow(2, bitCount - 1);
                    bitData = bitData >= half ? bitData : bitData - half * 2 + 1;
                }

                // dc存的是差值
                bitData += lastDc;
            } else {
                // 取ac值
                let bitString = _.numberToString(value);
                let zeroCount = parseInt(bitString.substr(0, 4), 2); // 数据前0的个数
                bitCount = parseInt(bitString.substr(4, 8), 2); // 数据的位数

                if (!zeroCount && !bitCount) {
                    // 解析到 (0, 0) ，表示到达EOB，意味着后面的都是0
                    while (output.length < 64) {
                        output.push(0);
                    }
                    break;
                } else {
                    if (!bitCount) {
                        bitData = 0;
                    } else {
                        bitData = input.slice(cursor, cursor + bitCount).toString(); // 读出数据
                        bitData = parseInt(bitData, 2);

                        let half = Math.pow(2, bitCount - 1);
                        bitData = bitData >= half ? bitData : bitData - half * 2 + 1;
                    }

                    for (let j = 0; j < zeroCount; j++) {
                        // 塞入数据前的0
                        output.push(0);
                        i++;
                    }
                }
            }

            output.push(bitData);
            cursor += bitCount;
        }

        return {
            cursor,
            output,
        };
    }

    /**
     * 解析图像数据
     */
    decodeImageData() {
        let mcus = [];

        // 解析mcus
        for (let block of this.data) {
            let chunk = block.chunk;

            // 数据转成位数组
            let buffer = Buffer.alloc(chunk.length * 8, 1);
            let index = 0;
            for (let byte of chunk) {
                let byteString = _.numberToString(byte);
                buffer.write(byteString, index, 8, 'utf8');

                index = index + 8;
            }

            // 读取数据单元
            let readDuSeq = this.readDuSeq;
            let mcuDuCount = readDuSeq.length;
            let mcu = [];
            let rindex = 0;
            let lastDc = {};
            while (buffer.length) {
                let colorComponentId = readDuSeq[rindex];

                // 哈夫曼解码
                let { cursor, output } = this.decodeHuffman(buffer, colorComponentId, lastDc[colorComponentId]);
                lastDc[colorComponentId] = output[0];
                buffer = buffer.slice(cursor);

                // 反量化
                output = this.quantify(output, colorComponentId, true);

                // zig-zag反编码
                output = this.zigZag(output, true);

                // 转矩阵
                output = _.arrayToMatrix(output, 8, 8);

                // 反dct编码
                output = this.fastIDct(output);

                mcu.push({
                    colorComponentId,
                    data: output,
                });

                rindex++;
                // 读完一个mcu，则重置游标，开始读下一个mcu
                if (rindex >= mcuDuCount) {
                    rindex = 0;

                    mcus.push(mcu);
                    mcu = [];
                }
            }
        }

        let width = this.width;
        let height = this.height;
        let hPixels = this.hmax * 8; // mcu横向像素数
        let vPixels = this.vmax * 8; // mcu纵向像素数
        let hNum = Math.ceil(width / hPixels); // 横向mcu个数
        let vNum = Math.ceil(height / vPixels); // 纵向mcu个数

        // 初始化像素数组
        let pixels = this.pixels = new Array(width);
        for (let i = 0; i < width; i++) {
            pixels[i] = new Array(height);
        }

        // 拼装图像，从左往右，从上往下
        for (let i = 0; i < hNum; i++) {
            for (let j = 0; j < vNum; j++) {
                let mcuPixels = this.getMcuPixels(mcus[j * hNum + i]);

                // 拼装单个mcu的图像
                let offsetX = i * hPixels;
                let offsetY = j * vPixels;
                for (let x = 0; x < hPixels; x++) {
                    for (let y = 0; y < vPixels; y++) {
                        let insertX = x + offsetX;
                        let insertY = y + offsetY;

                        if (insertX < width && insertY < height) pixels[insertX][insertY] = this.YCrCb2rgb(mcuPixels[x][y]);
                    }
                }
            }
        }

        return pixels;
    }

    /**
     * 获取单个mcu的图像
     * @param  {Array}  mcu 单个mcus数据
     * @return {Array}      对应大小的图像二维数组
     */
    getMcuPixels(mcu) {
        let hmax = this.hmax;
        let vmax = this.vmax;
        let colorComponent = this.colorComponent;

        let hPixels = hmax * 8; // mcu横向像素数
        let vPixels = vmax * 8; // mcu纵向像素数

        let output = [];

        // 初始化输出数组
        for (let i = 0; i < hPixels; i++) {
            output[i] = [];
            for (let j = 0; j < vPixels; j++) {
                output[i][j] = [];
            }
        }

        // 因为目前只支持YCrCb彩色图，所以其他颜色分量忽略
        let tempArr = [{ dus: [], index: 0 }, { dus: [], index: 2 }, { dus: [], index: 1 }]; // 0 - Y，1 - Cb，2 - Cr

        // 拆分颜色分量信息
        for (let du of mcu) {
            let colorComponentId = du.colorComponentId;

            let temp = tempArr[colorComponentId - 1];
            temp.x = colorComponent[colorComponentId].x; // 水平采样;
            temp.y = colorComponent[colorComponentId].y; // 垂直采样;
            temp.dus.push(du.data);
        }

        // 遍历du
        for (let temp of tempArr) {
            let x = temp.x;
            let y = temp.y;
            let dus = temp.dus;
            let xRange = hmax / x; // 采样块宽度
            let yRange = vmax / y; // 采样块高度

            // 初始化mcu原数据
            let data = [];
            for (let i = 0; i < hPixels; i++) {
                data[i] = [];
            }
            // 遍历du
            for (let h = 0; h < x; h++) {
                for (let v = 0; v < y; v++) {
                    let du = dus[v * x + h];

                    // 遍历像素点
                    for (let i = 0; i < 8; i++) {
                        let insertX = (i + h * 8) * xRange; // 采样点少的情况需要补偏移

                        for (let j = 0; j < 8; j++) {
                            let insertY = (j + v * 8) * yRange; // 采样点少的情况需要补偏移
                            let value = du[i][j];

                            // 遍历采样块
                            for (let rx = 0; rx < xRange; rx++) {
                                for (let ry = 0; ry < yRange; ry++) {
                                    data[insertX + rx][insertY + ry] = value;
                                }
                            }
                        }
                    }
                }
            }

            // 组装图像信息
            let index = temp.index;
            for (let i = 0; i < hPixels; i++) {
                for (let j = 0; j < vPixels; j++) {
                    output[i][j][index] = data[i][j] + 128;
                }
            }
        };

        return output;
    }
}

module.exports = Jpeg;
