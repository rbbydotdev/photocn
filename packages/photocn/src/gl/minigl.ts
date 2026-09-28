// @ts-nocheck — soft-fork upstream, was strict:false in xphoto
/* 
*  HEAVILY MODIFIED VERSION of glfx.js by Evan Wallace 
*  https://evanw.github.io/glfx.js/
*/

import * as Filters from './minigl_filters.js'
import {
  composeMatrix,
  effectiveCrop,
  imagePolygon,
  outputPixelSize,
  polygonBounds,
  type GeometryParams,
  type Size,
} from '../compose'

/** What `loadGeometry` renders. */
export type GeometryRenderSpec = {
  geometry: GeometryParams
  /** 'crop' renders the result; 'full' renders the whole warped image (crop tool). */
  view?: 'crop' | 'full'
  /** Exact output pixel size (export resize). Defaults to the crop at source resolution. */
  outputSize?: Size | null
}

const geometryFragmentSource = `#version 300 es
  precision highp float;
  in vec2 texCoord;
  uniform sampler2D _texture;
  uniform mat3 uMatrix;
  out vec4 outColor;
  void main() {
    vec3 p = uMatrix * vec3(texCoord, 1.0);
    vec2 uv = p.xy / p.z;
    if (p.z <= 0.0 || uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      outColor = vec4(0.0);
      return;
    }
    outColor = texture(_texture, uv);
  }
`
export {Spline} from './filters/cubicspline.js'

const usesrgb=true //to guarantee gamma correct workflow, SRGB in input - processing is linear - SRGB in output

type ColorSpace = PredefinedColorSpace | 'display-p3'
type TextureSource = TexImageSource & {
  width: number
  height: number
}
type CropRect = {
  left: number
  top: number
  width: number
  height: number
}
type UniformTexture = { unit: number }
type UniformValue = number | number[] | number[][] | UniformTexture
type Uniforms = Record<string, UniformValue>
type ShaderHandle = {
  drawRect: (refresh?: boolean, left?: number, top?: number, right?: number, bottom?: number) => void
  uniforms: (uni?: Uniforms) => void
}
type TextureHandle = {
  use: (unit?: number) => void
  destroy: () => void
  drawTo: () => void
  loadImage: (img: TextureSource, format?: number) => void
  initFromBytes: (width: number, height: number, data: ArrayBuffer | ArrayLike<number>, format?: number) => void
}
type MiniGlContext = WebGL2RenderingContext & {
  canvas: HTMLCanvasElement
  drawingBufferColorSpace: ColorSpace
  unpackColorSpace: ColorSpace
  vertexBuffer?: WebGLBuffer | null
  framebuffer?: WebGLFramebuffer | null
}
export type MiniGlRenderer = {
  width: number
  height: number
  gl: MiniGlContext
  img: TextureSource
  img_cropped?: HTMLImageElement
  /** Mirror of the renderer's current cropped state (set by `crop`, cleared by `resetCrop`). */
  appliedCrop?: CropRect
  destroy: () => void
  loadImage: () => void
  /** Like loadImage, but samples the source through the geometry (orientation, warp, crop). */
  loadGeometry: (spec: GeometryRenderSpec) => void
  paintCanvas: () => void
  crop: (rect: CropRect) => void
  resetCrop: () => void
  resize: (width: number, height: number) => void
  resetResize: () => void
  captureImage: (type?: string, quality?: number) => HTMLImageElement
  readPixels: () => Uint8Array
  runFilter: (shader: ShaderHandle, uniforms?: Uniforms | null) => void
  setupFiltersTextures: () => void
  _: Record<string, unknown>
} & Record<string, unknown>
type ShaderConstructor = new (
  gl: MiniGlContext,
  vertexSrc?: string | null,
  fragmentSrc?: string | null,
) => ShaderHandle
type TextureConstructor = new (
  gl: MiniGlContext,
  width?: number,
  height?: number,
) => TextureHandle

const ShaderCtor = Shader as unknown as ShaderConstructor
const TextureCtor = Texture as unknown as TextureConstructor

export function minigl(canvas: HTMLCanvasElement, img: TextureSource, colorspace?: ColorSpace) {
  // preserveDrawingBuffer: true so canvas pixels survive compositor cycles —
  // required for export (toBlob/toDataURL/drawImage) to work after async
  // gaps, and for tests that read pixels several frames after a render.
  // Costs a marginal copy per frame; acceptable for an editor.
  let gl = canvas.getContext("webgl2",{ antialias:false, premultipliedAlpha: true, preserveDrawingBuffer: true, }) as MiniGlContext | null
  if (!gl) return console.error("webgl2 not supported!")
  if(colorspace==="display-p3") {
    gl.drawingBufferColorSpace = "display-p3";
    gl.unpackColorSpace = "display-p3";
  } else {
    gl.drawingBufferColorSpace = "srgb";
    gl.unpackColorSpace = "srgb";
  }

  const _minigl: MiniGlRenderer= {
    width:0,
    height:0,
    gl,
    img,
    destroy,
    loadImage,
    loadGeometry,
    paintCanvas,
    crop,
    resetCrop,
    resize,
    resetResize,
    captureImage,
    readPixels,
    runFilter,
    setupFiltersTextures,
    // Swap the source bitmap. Re-uploads imageTexture, resizes the canvas
    // + FBOs to the new dimensions, drops any prior crop. Cheap (one
    // texture upload + a couple of FBO recreates) compared to a full
    // re-init. Added for proxy/full level swaps in the worker bridge —
    // without it, `_minigl.img = newImg; loadImage()` only changes a
    // metadata field; imageTexture still holds the originally-uploaded
    // pixels and the canvas/FBOs stay locked to the original dimensions.
    setSource,
    _:{} //for filters' storage
   }

  //update canvas size to image for full resolution. Use style to change visible sizes
  //prefer naturalWidth/naturalHeight on HTMLImageElement (img.width may reflect a CSS-sized rendered element)
  gl.canvas.width=_minigl.width=naturalSize(img).width
  gl.canvas.height=_minigl.height=naturalSize(img).height
 
  //create IMAGE TEXTURE && load image
  const imageTexture = new TextureCtor(gl)
  imageTexture.loadImage(img)
  //imageTexture.label='imageTXT'
  //create default SHADER
  const defaultShader = new ShaderCtor(gl)
  const flippedShader = new ShaderCtor(gl,null,flippedFragmentSource)
  const geometryShader = new ShaderCtor(gl,null,geometryFragmentSource)
  
  //create two effects' blank textures to handle [image-->shaderA-->txt1-->shaderB-->txt2-->canvas]
  //note: setupFiltersTextures needs to be re-run if canvas width/height change (eg when changing aspect ratio)
  let textures: TextureHandle[], count=0;
  function setupFiltersTextures(){
    if(textures?.length) textures.forEach(e=>e.destroy())
    textures=[]
    for (var ii = 0; ii < 2; ++ii) {
      // make the blank texture the same size as the canvas
      const texture = new TextureCtor(gl,gl.canvas.width, gl.canvas.height);
      textures.push(texture);
    }
  }
  setupFiltersTextures()

  function destroy(){
    if(textures?.length) textures.forEach(e=>e.destroy())
    if(croppedTexture) croppedTexture.destroy()
    imageTexture.destroy()
    delete _minigl.img_cropped
  }

  let current_texture: TextureHandle | undefined
  function runFilter(shader: ShaderHandle, uniforms?: Uniforms | null){
    if(uniforms) shader.uniforms(uniforms)
    //console.log('runFilter',current_texture.label)
    if(current_texture) current_texture.use()
    textures[count%2].drawTo()
    shader.drawRect()
    current_texture=textures[count%2]
    count++
  }

  function loadImage(){
    if(croppedTexture) current_texture= croppedTexture
    else current_texture=imageTexture
    runFilter(defaultShader,null)
  }

  // Non-destructive geometry: every render samples the original bitmap
  // through one projective matrix and sizes the canvas to the result.
  function loadGeometry(spec: GeometryRenderSpec){
    const source = naturalSize(img)
    const g = spec.geometry
    const rect = spec.view === 'full' ? polygonBounds(imagePolygon(g, source)) : effectiveCrop(g, source)
    const size = spec.outputSize ?? outputPixelSize(g, source, rect)
    if (gl.canvas.width !== size.width || gl.canvas.height !== size.height) {
      gl.canvas.width = _minigl.width = size.width
      gl.canvas.height = _minigl.height = size.height
      setupFiltersTextures()
    }
    const m = composeMatrix(g, source, rect)
    current_texture = imageTexture
    runFilter(geometryShader, { uMatrix: [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]] })
  }

  function paintCanvas(){
    if(current_texture) current_texture.use()
    gl.bindFramebuffer(gl.FRAMEBUFFER, null) //draw to canvas
    flippedShader.drawRect()
  }


  let resized = {width:0,height:0}
  function resize(width,height){
    gl.canvas.width=_minigl.width=resized.width = width
    gl.canvas.height=_minigl.height=resized.height = height
    setupFiltersTextures()
  }

  function setSource(newImg){
    img = newImg
    _minigl.img = newImg
    // Drop any crop state — the bitmap dimensions just changed.
    if (croppedTexture) { croppedTexture.destroy(); croppedTexture = undefined }
    delete _minigl.appliedCrop
    delete _minigl.img_cropped
    cropsize.width = cropsize.height = 0
    resized.width = resized.height = 0
    // Re-upload the source pixels into the persistent imageTexture.
    imageTexture.loadImage(newImg)
    // Resize canvas + FBO textures to match. Without this the FBOs stay
    // locked to the original full-res dims and we'd render the new bitmap
    // stretched across them — defeating the whole point of a smaller proxy.
    const ns = naturalSize(newImg)
    gl.canvas.width = _minigl.width = ns.width
    gl.canvas.height = _minigl.height = ns.height
    setupFiltersTextures()
    // Reset the filter ping-pong state so the next loadImage() starts from
    // imageTexture against fresh FBOs (rather than a stale current_texture
    // pointing at a destroyed FBO from before resize).
    current_texture = imageTexture
    count = 0
  }
  function resetResize(){
    if(!resized.width) return
    resized.width=resized.height=0
    gl.canvas.width=_minigl.width= cropsize.width || naturalSize(img).width
    gl.canvas.height=_minigl.height= cropsize.height || naturalSize(img).height
    setupFiltersTextures()
  }

  
  let croppedTexture: TextureHandle | null
  let cropsize = {width:0,height:0}
  function crop({left, top, width, height}: CropRect){ 
      const length = width * height * 4;
      const data = new Uint8Array(length);

      //FIX FOR SAFARI & display-p3 bug (a direct GL->2D drawImage loses colorspace ... this is a workaround)
      runFilter(defaultShader,{})
      gl.readPixels(left,top,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);
      const cropColorspace=gl.unpackColorSpace
      const imgdata_cropped = new ImageData(new Uint8ClampedArray(data.buffer), width, height, { colorSpace: cropColorspace})

      croppedTexture = new TextureCtor(gl)
      croppedTexture.loadImage(imgdata_cropped)
      gl.canvas.width=_minigl.width=cropsize.width = width
      gl.canvas.height=_minigl.height=cropsize.height = height
      setupFiltersTextures()
      // Main-thread convenience only; workers have no DOM to build an <img>.
      if (typeof document !== 'undefined') {
        _minigl.img_cropped = imagedata_to_image(imgdata_cropped,cropColorspace)
      }
      _minigl.appliedCrop = {left, top, width, height}
  }

  function resetCrop(){
    if(!croppedTexture) return
    croppedTexture.destroy()
    croppedTexture=null
    cropsize.width=cropsize.height=0
    gl.canvas.width=_minigl.width= resized.width || naturalSize(img).width
    gl.canvas.height=_minigl.height= resized.height || naturalSize(img).height
    delete _minigl.img_cropped
    delete _minigl.appliedCrop
    setupFiltersTextures()
  }

  //type: String - indicating the image format. The default type is image/png
  //quality: Number - between 0 and 1 indicating the image quality to be used with lossy compression
  //returns Image
  function captureImage(type?: string, quality?: number){
      runFilter(defaultShader,{})
      const {width,height}=gl.canvas
      const length = width * height * 4;
      const data = new Uint8Array(length);
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);
      //note: data.buffer contains raw pixel ArrayBuffer (for future reference to feed an image compressor)
      const colorspace=gl.unpackColorSpace
      const imgdata = new ImageData(new Uint8ClampedArray(data.buffer), width, height, { colorSpace: colorspace})
      return imagedata_to_image(imgdata, colorspace, type,quality)
  }

  function readPixels(){
      runFilter(defaultShader,{})
      const {width,height}=gl.canvas
      const length = width * height * 4;
      const data = new Uint8Array(length);
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);
      return data
  }



  //load all filters
  function wrap(fn: (mini: MiniGlRenderer, ...args: unknown[]) => unknown){
    return function(...args: unknown[]){fn(_minigl,...args)}
  }
  Object.keys(Filters).forEach(f=>_minigl[f]=wrap(Filters[f as keyof typeof Filters] as (mini: MiniGlRenderer, ...args: unknown[]) => unknown))

  return _minigl
}

const flippedFragmentSource = usesrgb
      ?`#version 300 es
        precision highp float;
        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;

        vec4 fromLinear(vec4 linearRGB) {
            bvec3 cutoff = lessThan(linearRGB.rgb, vec3(0.0031308));
            vec3 higher = vec3(1.055)*pow(linearRGB.rgb, vec3(1.0/2.4)) - vec3(0.055);
            vec3 lower = linearRGB.rgb * vec3(12.92);
            return vec4(mix(higher, lower, cutoff), linearRGB.a);
        }

        void main() {
            vec4 color = texture(_texture, vec2(texCoord.x, 1.0 - texCoord.y));
            //outColor = color;
            outColor = fromLinear(color);
        }`
      :`#version 300 es
        precision highp float;
        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;

        void main() {
            outColor = texture(_texture, vec2(texCoord.x, 1.0 - texCoord.y));
        }`


export function Shader(gl: MiniGlContext, vertexSrc?: string | null, fragmentSrc?: string | null): ShaderHandle {

      const defaultVertexSource = `#version 300 es
        in vec2 vertex;
        out vec2 texCoord;

        void main() {
          texCoord = vertex;
          gl_Position = vec4(vertex * 2.0 - 1.0, 0.0, 1.0);
        }
      `;

      const defaultFragmentSource = `#version 300 es
        precision highp float;

        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;   

        void main() {
          outColor = texture(_texture, texCoord);
        }
      `;


    const program = gl.createProgram()
    if (!program) throw new Error('could not create WebGL program')
    let vertex: number | undefined
    gl.attachShader(program,compileSource(gl, gl.VERTEX_SHADER, vertexSrc||defaultVertexSource))
    gl.attachShader(program,compileSource(gl, gl.FRAGMENT_SHADER,fragmentSrc|| defaultFragmentSource))
    gl.linkProgram(program)
    

    function drawRect(refresh=true, left?: number, top?: number, right?: number, bottom?: number){
          //get the current viewport
          const viewport = gl.getParameter(gl.VIEWPORT);
          left = left !== undefined ? (left - viewport[0]) / viewport[2] : 0;
          top = top !== undefined ? (top - viewport[1]) / viewport[3] : 0;
          right = right !== undefined ? (right - viewport[0]) / viewport[2] : 1;
          bottom = bottom !== undefined ? (bottom - viewport[1]) / viewport[3] : 1;

      //prepare vertex
      gl.useProgram(program)
      gl.vertexBuffer = gl.vertexBuffer || gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.vertexBuffer)
      //1 unit wad
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([ left, top, left, bottom, right, top, right, bottom ]),
        gl.STATIC_DRAW
      )
      if(!vertex) {
        vertex = gl.getAttribLocation(program, "vertex")
        gl.enableVertexAttribArray(vertex)
      }
      gl.vertexAttribPointer(vertex, 2, gl.FLOAT, false, 0, 0)

      //convert from clip space to pixel space
      //gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
      //clear canvas
      if(refresh){
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | (gl as any).GL_DEPTH_BUFFER_BIT);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    
    function uniforms(uni: Uniforms={}){
      gl.useProgram(program);
      for (let name in uni) {
        const location = gl.getUniformLocation(program, name);
        if (location === null) continue; // will be null if the uniform isn't used in the shader
        let value = uni[name];
        if (Array.isArray(value)) {
          switch (value.length) {
            case 1: {
              if(Array.isArray(value[0])) value=value[0] //to load uniform float array[9]
              gl.uniform1fv(location, new Float32Array(value as number[])); break;
            }
            case 2: gl.uniform2fv(location, new Float32Array(value as number[])); break;
            case 3: gl.uniform3fv(location, new Float32Array(value as number[])); break;
            case 4: gl.uniform4fv(location, new Float32Array(value as number[])); break;
            case 9: gl.uniformMatrix3fv(location, false, new Float32Array(value as number[])); break;
            case 16: gl.uniformMatrix4fv(location, false, new Float32Array(value as number[])); break;
            default: throw 'dont\'t know how to load uniform "' + name + '" of length ' + value.length;
          }
        } 
        else if (typeof value === 'object' && value !== null && 'unit' in value) { // {unit:1} ... it's a texture loaded in slot unit
          gl.uniform1i(location, value.unit);
        }
        else if (typeof value === 'number') {
          gl.uniform1f(location, value);
        } 
        else {
          throw 'attempted to set uniform "' + name + '" to invalid value ' + (value || 'undefined').toString();
        }       
      }
    }
    
    function compileSource(gl: MiniGlContext, type: number, source: string) {
      var shader = gl.createShader(type)
      if (!shader) throw new Error('could not create WebGL shader')
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw "compile error: " + gl.getShaderInfoLog(shader)
      }
      return shader
    }


    return {drawRect, uniforms}
}

export function Texture(gl: MiniGlContext, width?: number, height?: number): TextureHandle {
    let _width=width, _height=height
    let txt = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, txt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    //if size provided, create blank texture

    const internalFormat = usesrgb ? gl.SRGB8_ALPHA8 : gl.RGBA
    if (width && height) gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    //if (width && height) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    function use(unit=0){
      if(!txt) return console.error('texture has been destroyed')
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, txt)
    }
    function destroy(){
      gl.deleteTexture(txt);
      txt=null
    }
    function drawTo(){
      if(!txt) return console.error('texture has been destroyed')
      // create/ reuse a framebuffer
      gl.framebuffer = gl.framebuffer || gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, gl.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, txt, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          throw new Error('incomplete framebuffer');
      }
      //sets the conversion from normalized device coordinates/ clip space to pixel space
      gl.viewport(0,0,_width as number,_height as number)
    }
    function loadImage(img: TextureSource, format?: number){
      if(!txt) return console.error('texture has been destroyed')
      const ns = naturalSize(img)
      _width=ns.width
      _height=ns.height
      gl.bindTexture(gl.TEXTURE_2D, txt)

      let internalFormat = format || (usesrgb ? gl.SRGB8_ALPHA8 : gl.RGBA)
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, gl.RGBA, gl.UNSIGNED_BYTE, img)
      //gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
      //gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, img)
    }
    function initFromBytes(width: number, height: number, data: ArrayBuffer | ArrayLike<number>, format?: number) {
      _width=width
      _height=height
      gl.bindTexture(gl.TEXTURE_2D, txt);
      let internalFormat = format || (usesrgb ? gl.SRGB8_ALPHA8 : gl.RGBA)
      //console.log('initFromBytes',internalFormat)
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(data));
      //gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(data));
    };
    
    return {use, destroy, drawTo, loadImage, initFromBytes}
}

// Prefer naturalWidth/naturalHeight on HTMLImageElement (img.width can reflect a CSS-rendered size).
// Falls back to width/height for Canvas, ImageData, ImageBitmap, OffscreenCanvas, VideoFrame.
function naturalSize(img: TextureSource): { width: number; height: number } {
  const candidate = img as Partial<HTMLImageElement>;
  const width = candidate.naturalWidth || img.width;
  const height = candidate.naturalHeight || img.height;
  return { width, height };
}

function imagedata_to_image(imagedata: ImageData, colorspace: ColorSpace, type?: string, quality?: number) {
    const canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d',{ colorSpace: colorspace });
    canvas.width = imagedata.width;
    canvas.height = imagedata.height;
    ctx!.putImageData(imagedata, 0, 0);

    var image = new Image();
    image.src = canvas.toDataURL(type, quality);
    return image;
}
