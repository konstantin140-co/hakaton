#define DefaultGamma 2.2

#ifdef USE_IBL
	#ifdef USE_SPHERICAL_MAPS
		uniform sampler2D u_SpecularEnvSampler;
	#else
		uniform samplerCube u_SpecularEnvSampler;
	#endif
	uniform samplerCube u_DiffuseEnvSampler;
	uniform sampler2D u_brdfLUT;
#endif

#ifdef HAS_OCCLUSIONMAP
	uniform sampler2D u_OcclusionSampler;
	uniform float u_OcclusionStrength;
#endif

uniform vec3 u_LightDirection ;
uniform vec3 u_LightColor;
uniform mat4 osg_ViewMatrixInverse;
uniform vec2 u_MetallicRoughnessValues;
uniform float u_MetallicValue;
uniform float u_RoughnessValue;
uniform float u_GlossinessFactor;
uniform vec3 u_SpecularFactor;
uniform vec4 u_BaseColorFactor;

varying vec4 v_VertexColor;

#ifdef USE_SPHERICAL_MAPS
vec2 SampleSphericalMap(vec3 v)
{
    vec2 uv = vec2(atan(v.z, -v.x), asin(v.y));
	vec2 invAtan = vec2(0.1591, 0.3183);
    uv *= invAtan;
    uv += 0.5;
    return uv;
}

vec4 textureSphereEnv(vec3 dir)
{
	return texture2D(u_SpecularEnvSampler, SampleSphericalMap(dir));
}
#endif

uniform vec4 u_ScaleDiffBaseMR;
uniform vec4 u_ScaleFGDSpec;
uniform float u_ScaleIBLDiffuse;
uniform float u_ScaleIBLSpecular;

#ifdef HAS_BASECOLORMAP
uniform sampler2D u_BaseColorSampler;
#endif


uniform sampler2D u_MetallicRoughnessSampler;	// в этот сэмплер пишется или metalRoughness или specularGlossiness

varying vec3 v_Position;
varying vec2 v_UV;
varying vec3 v_Normal;

struct PBRInfo
{
    float NdotL;                  // cos angle between normal and light direction
    float NdotV;                  // cos angle between normal and view direction
    float NdotH;                  // cos angle between normal and half vector
    float LdotH;                  // cos angle between light direction and half vector
    float VdotH;                  // cos angle between view direction and half vector
    float perceptualRoughness;    // roughness value, as authored by the model creator (input to shader)
    float metalness;              // metallic value at the surface
    vec3 reflectance0;            // full reflectance color (normal incidence angle)
    vec3 reflectance90;           // reflectance color at grazing angle
    float alphaRoughness;         // roughness mapped to a more linear change in the roughness (proposed by [2])
    vec3 diffuseColor;            // color contribution from diffuse lighting
    vec3 specularColor;           // color contribution from specular lighting
};

const float M_PI = 3.141592653589793;
const float c_MinRoughness = 0.04;


float mysRGBToLinear(const in float c, const in float gamma)
{
    float v = 0.0;
    if ( c < 0.04045 ) {
        if ( c >= 0.0 )
            v = c * ( 1.0 / 12.92 );
    } else {
        v = pow( ( c + 0.055 ) * ( 1.0 / 1.055 ), gamma );
    }
    return v;
}
vec4 mysRGBToLinear(const in vec4 col_from, const in float gamma)
{
    vec4 col_to;
    col_to.r = mysRGBToLinear(col_from.r, gamma);
    col_to.g = mysRGBToLinear(col_from.g, gamma);
    col_to.b = mysRGBToLinear(col_from.b, gamma);
    col_to.a = col_from.a;
    return col_to;
}
vec3 mysRGBToLinear(const in vec3 col_from, const in float gamma)
{
    vec3 col_to;
    col_to.r = mysRGBToLinear(col_from.r, gamma);
    col_to.g = mysRGBToLinear(col_from.g, gamma);
    col_to.b = mysRGBToLinear(col_from.b, gamma);
    return col_to;
}

vec4 mysRGBToLinearTest(const in vec4 col_from, const in float gamma)
{
    vec4 col_to;
    col_to.r = mysRGBToLinear(col_from.r, gamma);
    col_to.g = mysRGBToLinear(col_from.g, gamma);
    col_to.b = mysRGBToLinear(col_from.b, gamma);
    col_to.a = col_from.a;
    return col_to;
}



vec4 SRGBtoLINEAR(vec4 srgbIn)
{
    #ifdef MANUAL_SRGB
    #ifdef SRGB_FAST_APPROXIMATION
    vec3 linOut = pow(srgbIn.xyz,vec3(2.2));
    #else //SRGB_FAST_APPROXIMATION
    vec3 bLess = step(vec3(0.04045),srgbIn.xyz);
    vec3 linOut = mix( srgbIn.xyz/vec3(12.92), pow((srgbIn.xyz+vec3(0.055))/vec3(1.055),vec3(2.4)), bLess );
    #endif //SRGB_FAST_APPROXIMATION
    return vec4(linOut,srgbIn.w);;
    #else //MANUAL_SRGB
	 vec3 bLess = step(vec3(0.04045),srgbIn.xyz);
	vec3 linOut = mix( srgbIn.xyz/vec3(12.92), pow((srgbIn.xyz+vec3(0.055))/vec3(1.055),vec3(2.4)), bLess );
	return vec4(linOut,srgbIn.w);;
    //return srgbIn;
    #endif //MANUAL_SRGB
}

void main()
{

#ifdef HAS_BASECOLORMAP
	vec4 baseColor = SRGBtoLINEAR(texture2D(u_BaseColorSampler, v_UV)) * u_BaseColorFactor;		
	
	  #ifdef	VERTEX_COLOR
				vec3 vertexColorLinear = mysRGBToLinear(v_VertexColor.rgb, DefaultGamma );
					if(vertexColorLinear.rgb != vec3(0.0) && v_VertexColor.a != 0.0)
					{
						baseColor *= v_VertexColor;
						baseColor.a *= v_VertexColor.a;
					}	
	   #endif		
	#else
	   vec4 baseColor = u_BaseColorFactor;
	   #ifdef	VERTEX_COLOR
				vec3 vertexColorLinear = mysRGBToLinear(v_VertexColor.rgb, DefaultGamma );
					if(vertexColorLinear.rgb != vec3(0.0) && v_VertexColor.a != 0.0)
					{
						baseColor *= v_VertexColor;
						baseColor.a *= v_VertexColor.a;
					}	
	   #endif
	#endif
	
    vec3 f0 = vec3(0.04);
    vec3 diffuseColor = baseColor.rgb;

		#ifdef HAS_BLENDING
		gl_FragColor = vec4(diffuseColor, baseColor.a);
		#else
		gl_FragColor = vec4(pow(diffuseColor,vec3(1.0/2.2)), baseColor.a);
		#endif
}