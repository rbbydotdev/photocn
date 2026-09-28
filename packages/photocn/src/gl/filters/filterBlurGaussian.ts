import { Shader } from '../minigl.js'

type ShaderHandle = {
    drawRect: (...args: any[]) => void
    uniforms: (uniforms?: Uniforms) => void
}

type ShaderConstructor = new (
    gl: WebGL2RenderingContext,
    vertexSrc?: string | null,
    fragmentSrc?: string | null,
) => ShaderHandle

type UniformValue = number | number[]
type Uniforms = Record<string, UniformValue>

type FilterCache = {
    $gaussianblur?: ShaderHandle
}

type MiniGLFilterHost = {
    gl: WebGL2RenderingContext
    _: FilterCache
    runFilter: (shader: ShaderHandle, uniforms?: Uniforms | null) => void
}

type GaussianBlurParams = Partial<{
    gaussianstrength: number
    gaussianlensin: number
    gaussianlensout: number
    centerX: number
    centerY: number
}>

const ShaderCtor = Shader as unknown as ShaderConstructor

export function filterBlurGaussian(mini: MiniGLFilterHost, params?: GaussianBlurParams | null) {
    const _fragment = `#version 300 es
        //https://www.shadertoy.com/view/XdfGDH
        precision highp float;

        in vec2 texCoord;
        uniform sampler2D _texture;
        out vec4 outColor;

        uniform vec2 uResolution;
        uniform float gaussianstrength;
        uniform float gaussianlensin;
        uniform float gaussianlensout;
        uniform float centerX;
        uniform float centerY;

        float normpdf(in float x, in float sigma)
        {
          return 0.39894*exp(-0.5*x*x/(sigma*sigma))/sigma;
        }

        void main() {
            vec4 color = texture(_texture, texCoord);

            //declare stuff
            const int mSize = 11;
            const int kSize = (mSize-1)/2;
            float kernel[mSize];
            vec3 final_colour = vec3(0.0);
            
            //create the 1-D kernel
            float sigma = 7.0*gaussianstrength;
            float Z = 0.0;
            for (int j = 0; j <= kSize; ++j)
            {
              kernel[kSize+j] = kernel[kSize-j] = normpdf(float(j), sigma);
            }
            
            //get the normalization factor (as the gaussian has been clamped)
            for (int j = 0; j < mSize; ++j)
            {
              Z += kernel[j];
            }
            
            //read out the texels
            for (int i=-kSize; i <= kSize; ++i)
            {
              for (int j=-kSize; j <= kSize; ++j)
              {
                final_colour += kernel[kSize+j]*kernel[kSize+i]*texture(_texture, (texCoord.xy+vec2(float(i),float(j))/uResolution)).rgb;
              }
            }
            
            //vignette used to control alpha
            //to blur inside circle smoothstep(lensin, lensout, dist)
            //to blur outside circle smoothstep(lensout, lensin, dist)
            float dist = distance(texCoord.xy, vec2(centerX,centerY));
            float vigfin = pow(1.-smoothstep(max(0.001,gaussianlensout), gaussianlensin, dist),2.);

            outColor = mix( color, vec4(final_colour/(Z*Z), 1.0), vigfin);
        }
      `

    const {gl}=mini
    let { gaussianstrength=0.5, gaussianlensin=0, gaussianlensout=0.5, centerX=0, centerY=0} = params || {}
    const uResolution = [gl.canvas.width,gl.canvas.height];
    //setup and run effect

    mini._.$gaussianblur = mini._.$gaussianblur || new ShaderCtor(gl, null, _fragment);
    mini.runFilter(mini._.$gaussianblur, {gaussianstrength,gaussianlensin,gaussianlensout,centerX,centerY,uResolution} )
}
