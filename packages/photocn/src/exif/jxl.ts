// Derived from mini-photo-editor (https://github.com/xdadda/mini-photo-editor),
// MIT © 2025 xdadda. See THIRD_PARTY_NOTICES.md.
import {readEXIFData} from './exif.js'

import {getStringFromDB, downloadFile} from './tools.js'

const importBrotli = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<{
  default: {
    decompress(data: Uint8Array): Uint8Array
  }
}>
const brotliPromise = async()=>await importBrotli('brotli-wasm')

const debug=false

type Box = {
  type: number
  length: number
  str: string
  contentOffset: number
}

type BoxMap = Record<string, Pick<Box, 'length' | 'str' | 'contentOffset'>>

type JxlParseResult = {
  exif?: ArrayBuffer
  xml?: ArrayBuffer
}

// https://github.com/libjxl/libjxl/blob/main/doc/format_overview.md
//NOTE colorspace is either in a ICC profile or in CICP-style Enum values

// https://github.com/ImageMagick/jpeg-xl/blob/main/doc/format_overview.md

      function getBoxLength(dataView: DataView, offset: number) {
          const boxLength = dataView.getUint32(offset);
          if (boxLength === 0) {
              return {
                  length: dataView.byteLength - offset,
                  contentOffset: offset + 4 + 4,
              };
          }
          if (boxLength === 1) {
              if (dataView.getUint32(offset + 8) === 0) {
                  return {
                      length: dataView.getUint32(offset + 12),
                      contentOffset: offset + 4 + 4 + 8,
                  };
              }
          }
          return {
              length: boxLength,
              contentOffset: offset + 4 + 4,
          };
      }
      function parseBox(dataView: DataView, offset: number): Box | undefined {
        const {length, contentOffset} = getBoxLength(dataView, offset)
        if(length < 8) return undefined
        const type = dataView.getUint32(offset + 4)
        return {type,length, str:getStringFromDB(dataView,offset+4,4), contentOffset}
      }
      function parseSubbox(dataView: DataView, box: Pick<Box, 'length' | 'contentOffset'>): BoxMap {
        let sub: BoxMap = {}
        let len = box.length-8, poffset=box.contentOffset
        while (len>0) {
          //check properties: size(4)+tag(4)
          const pstr = getStringFromDB(dataView,poffset+4,4), psize = dataView.getUint32(poffset)
          sub[pstr]={length:psize, str:pstr, contentOffset:poffset+8}
          poffset+=psize
          len -= psize
        }
        return sub
      }

      async function decompressBrob(data: Uint8Array): Promise<Uint8Array>{
        const brotli = await(await brotliPromise()).default;
        return brotli.decompress(data);
      }

  // @data: is file's ArrayBuffer
  // return {icc:{data:,offset},exif:{data:,offset:}}
  async function jxl_parseBoxes(data: ArrayBuffer): Promise<JxlParseResult | void> {
    if(!(data instanceof ArrayBuffer)) return console.error('[MiNi exif]: input must be an ArrayBuffer')
    const datalength = data.byteLength
    const dataView = new DataView(data);

    if(!(dataView.getUint32(4)===0x4A584C20 && dataView.getUint32(8)===0x0D0A870A))
      return console.error('[MiNi exif]: data is not JPEG-XL')


    let offset=0
    let exifdata: ArrayBuffer | undefined, xmldata: ArrayBuffer | undefined
    while (offset + 4 + 4 <= dataView.byteLength) {
        const box = parseBox(dataView, offset);
        if (box === undefined) break;
        debug&&console.log('>',box)
        if (box.str === 'meta') {
          offset += 12 //let's open it
          continue
        }
        if(box.str === 'brob') {
          //const brotliPromise = await import('brotli-wasm')
          const key = getStringFromDB(dataView,box.contentOffset,4)
          debug&&console.log('brob>',key,box.length-12)
          if(key==='Exif'){
            const load = data.slice(box.contentOffset+4,box.contentOffset+4+box.length-12)
            const decompressed = await decompressBrob(new Uint8Array(load))
            exifdata = decompressed.buffer as ArrayBuffer
          }
          else if(key==='xml '){
            const load = data.slice(box.contentOffset+4,box.contentOffset+4+box.length-12)
            const decompressed = await decompressBrob(new Uint8Array(load))
            xmldata = decompressed.buffer as ArrayBuffer
          }
        }
        if(box.str === 'Exif'){
          exifdata=data.slice(box.contentOffset,box.contentOffset+box.length-8)
        }
        if(box.str === 'xml '){
          xmldata=data.slice(box.contentOffset,box.contentOffset+box.length-8)
        }
        offset += box.length;
    }
    return {exif:exifdata, xml:xmldata}
  }



  export async function exifJXL(arrayBuffer: ArrayBuffer){
    let filedata=arrayBuffer;
    let exifdata: ArrayBuffer | undefined, xmldata: ArrayBuffer | undefined, exiftags: any;

    async function updateJXL(){
      if(filedata) {
        const {exif, xml} = await jxl_parseBoxes(filedata) as JxlParseResult
        exifdata=exif
        xmldata=xml
      }
      updateTags()
    }

    function updateTags(){
      if(exifdata) {
        exiftags= readEXIFData(exifdata, 4)
        exiftags={...exiftags,format:'JXL'}
      }
      else {exiftags=null}

      if(xmldata) {
        const decoder = new TextDecoder();
        const str = decoder.decode(xmldata);
        exiftags={...exiftags, xml:str};
      }
    }
    await updateJXL()
    
    return {
      load:(arrayBuffer: ArrayBuffer)=>{filedata=arrayBuffer;updateJXL();}, //input file's arrayBuffer
      read:()=>exiftags, //returns EXIF tags
      extract:()=>exifdata,
      image:()=>filedata,
      download:(name?: string)=>downloadFile(filedata,name),
    }

  }
