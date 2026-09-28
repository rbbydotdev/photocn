type DataViewReader = Pick<DataView, 'getUint8'>
type ByteBuffer = ArrayBuffer
type NumericArrayWithReduce = {
  readonly [index: number]: number
  reduce(
    callbackfn: (previousValue: number, currentValue: number, currentIndex: number) => number,
    initialValue: number,
  ): number
}
type RationalNumber = Number & {
  numerator: number
  denominator: number
}
type DMSResult = {
  ref: 'W' | 'S' | 'E' | 'N'
  deg: number
  min: number
  sec: number
  DMS: [RationalNumber, RationalNumber, RationalNumber]
}

// Type-only declaration; keeps the existing runtime global-name lookup unchanged.
declare const ConvertDDToDMS: typeof convertDDToDMS

export function getStringFromDB(buffer: DataViewReader, start: number, length: number): string {
  var outstr = "";
  for (var n = start; n < start + length; n++) {
    outstr += String.fromCharCode(buffer.getUint8(n));
  }
  return outstr;
}

export function int32ToBytes (int: number): Uint8Array {
  return new Uint8Array([
    (int >> 24) & 0xff,
    (int >> 16) & 0xff,
    (int >> 8) & 0xff,
    int & 0xff,
  ])
}

export function int16ToBytes (int: number): Uint8Array {
  return new Uint8Array([
    (int >> 8) & 0xff,
    int & 0xff,
  ])
}

export function strToBytes(text: string): Uint8Array {
  return Uint8Array.from(Array.from(text).map(l => l.charCodeAt(0)));
}

export function concatArrayBuffers(...bufs: ByteBuffer[]): ArrayBuffer {
  const result = new Uint8Array(bufs.reduce((totalSize, buf)=>totalSize+buf.byteLength,0));
  bufs.reduce((offset, buf)=>{
    result.set(new Uint8Array(buf),offset)
    return offset+buf.byteLength
  },0)
  return result.buffer
}

//data is blob or arraybuffer
export function downloadFile(data: ArrayBuffer | Blob, name?: string): void {
  if(!document) return console.error('[MiNi exif]: download file is browser only')
  if(!name) return console.error('[MiNi exif]: download missing output filename')
  if(!data || !(data instanceof ArrayBuffer) && !(data instanceof Blob)) return console.error('[MiNi exif]: download wrong data input')
  let blob: Blob | undefined
  if(data instanceof ArrayBuffer) blob = new Blob([data]);
  var el = document.createElement('a')
  el.href = URL.createObjectURL(blob as Blob)
  el.download = name
  el.click()
}

///// GPS DMS/DD FUNCS ////
export function convertDMStoDD(array: NumericArrayWithReduce): number { //eg new Uint32Array([0x25,0x1,0x30,0x1,0x08A5,0x64])
  return array.reduce((p,v,i)=>{ 
    if(i===0) p+=v/array[i+1]
    if(i===2) p+=v/array[i+1]/60
    if(i===4) p+=v/array[i+1]/3600
    return p
  },0)
}

export function convertDDToDMS(D: string | number, lng: boolean): DMSResult {
  D=parseFloat(D as string);
  const x = {
    ref: D < 0 ? (lng ? "W" : "S") : lng ? "E" : "N",
    deg: 0 | (D < 0 ? (D = -D) : D),
    min: 0 | (((D += 1e-9) % 1) * 60),
    sec: (0 | (((D * 60) % 1) * 6000)) / 100,
  } as Omit<DMSResult, 'DMS'> & Partial<Pick<DMSResult, 'DMS'>>
  let tD = new Number(x.deg) as RationalNumber
  tD.numerator=x.deg
  tD.denominator=1
  let tM = new Number(x.min) as RationalNumber
  tM.numerator=x.min
  tM.denominator=1
  let tS = new Number(x.sec) as RationalNumber
  tS.numerator=x.sec*100
  tS.denominator=100
  x.DMS= [tD,tM,tS]
  return x as DMSResult
}

export function convertLatLngToDMS(lat: string | number, lng: string | number): { lat: DMSResult, lng: DMSResult } {
  return {lat: ConvertDDToDMS(lat,false), lng: ConvertDDToDMS(lng,true)}
}
///////////////////////////


/*
///// FILES FUNCS ////
async function getFirstBytesfromFile(path,bytesToRead,position=0) {
  try {
    const handle = await open(path, 'r');
    const { buffer } = await handle.read(Buffer.alloc(bytesToRead), 0, bytesToRead, position);
    await handle.close()
    return buffer    
  } catch (err) {
    console.error('[MiNi exif]: read',err)
    return false
  }
}

async function getLastBytesfromFile(path,bytesToRead) {
  try {
    const handle = await open(path, 'r');
    const { size } = await handle.stat(path)
    const position = size - bytesToRead; 
    const { buffer } = await handle.read(Buffer.alloc(bytesToRead), 0, bytesToRead, position);
    await handle.close()
    return buffer
  } catch (err) {
    console.error('[MiNi exif]: read',err)
    return false
  }
}

async function fetchFile(url){
  try {
    const arraybuffer = await fetch(url).then(r => r.arrayBuffer())
    return arraybuffer
  } catch (err) {
    console.error('[MiNi exif]: fetch',err)
    return false
  }
}

async function readFile(file){
  try {
    if(file instanceof ArrayBuffer) return file
    const arraybuffer = await fetch(file).then(r => r.arrayBuffer())
    return arraybuffer
  } catch (err) {
    console.error('[MiNi exif]: fetch',err)
    return false
  }
}    
//////////////////////
*/
