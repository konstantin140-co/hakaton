//GLTF 2.0 fragment shader
#define DefaultGamma 2.2

#ifdef USE_IBL
	#ifdef USE_SPHERICAL_MAPS
		uniform sampler2D u_SpecularEnvSampler;
	#else
		uniform samplerCube u_SpecularEnvSampler;
	#endif
	uniform samplerCube u_DiffuseEnvSampler;
	uniform sampler2D u_brdfLUT;
    uniform float u_ScaleIBLDiffuse;
    uniform float u_ScaleIBLSpecular;
#endif

#ifdef HAS_OCCLUSIONMAP
	uniform sampler2D u_OcclusionSampler;
	uniform float u_OcclusionStrength;
#endif

#ifdef MASK_CUTOFF
    uniform float u_alphaCutoff;
#endif

#ifdef SPECULAR_GLOSSINESS
    uniform float u_GlossinessFactor;
    uniform vec3 u_SpecularFactor;
#endif

uniform vec3 u_LightDirection;
uniform vec3 u_LightColor;
uniform mat4 osg_ViewMatrixInverse;
uniform float u_MetallicValue;
uniform float u_RoughnessValue;
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
	return texture2D(u_SpecularEnvSampler, -SampleSphericalMap(dir));
}
#endif

#ifdef HAS_BASECOLORMAP
	uniform sampler2D u_BaseColorSampler;
#endif

#ifdef HAS_NORMALMAP
	uniform sampler2D u_NormalSampler;
	uniform float u_NormalScale;
#endif

#ifdef HAS_EMISSIVEMAP
	uniform sampler2D u_EmissiveSampler;
#endif
    uniform vec3 u_EmissiveFactor;

#ifdef KHR_MATERIALS_EMISSIVE_STRENGTH
      	uniform float u_EmissiveStrength;
#endif

#if defined(HAS_SPECULAR_GLOSSINESSMAP) || defined(HAS_METALROUGHNESSMAP)
    uniform sampler2D u_MetallicRoughnessSampler;
#endif

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
    if (c < 0.04045) {
        if (c >= 0.0)
            v = c * (1.0 / 12.92);
    } else {
        v = pow((c + 0.055) * (1.0 / 1.055), gamma );
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
		return vec4(linOut,srgbIn.w);
    #endif //MANUAL_SRGB
}

vec3 getNormalTheBestOfTheBest()
{

#ifdef HAS_NORMALMAP
    vec3 normalRGB = texture2D(u_NormalSampler, v_UV).rgb;
    vec3 normalMap = normalRGB*2.0 - 1.0;
#endif
    vec3 N = normalize(v_Normal);
    vec3 V = normalize(v_Position);
    vec3 dp1 = dFdx(-V);
    vec3 dp2 = dFdy(-V);
    vec2 duv1 = dFdx(v_UV);
    vec2 duv2 = dFdy(v_UV);

  // solve the linear system
    vec3 dp2perp = cross(dp2, N);
    vec3 dp1perp = cross(N, dp1);
    vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
    vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;

  // construct a scale-invariant frame 
  float invmax = 1.0 / sqrt(max(dot(T,T), dot(B,B)));
  mat3 TBN = mat3(T * invmax, B * invmax, N);
	
#ifdef HAS_NORMALMAP	
	vec3 n  = normalize(TBN * normalMap);
#else
	vec3 n = N;
#endif
	
	return n;
}

#ifdef USE_IBL
vec3 getIBLContribution(PBRInfo pbrInputs, vec3 n, vec3 reflection)
{
	float mipCount = 9.0; // resolution of 512x512
    float lod = (pbrInputs.perceptualRoughness * mipCount);

    vec3 brdf = SRGBtoLINEAR(texture2D(u_brdfLUT, vec2(pbrInputs.NdotV, 1.0 - pbrInputs.perceptualRoughness))).rgb;
    vec3 diffuseLight = SRGBtoLINEAR(textureCube(u_DiffuseEnvSampler, -n)).rgb;
	
#ifdef USE_SPHERICAL_MAPS
	vec3 specularLight = SRGBtoLINEAR(textureSphereEnv(reflection)).rgb;
#else
    #ifdef USE_REVERSE_SPECULAR_TEX
        vec3 reverse_reflection = vec3(-reflection.x, -reflection.y, reflection.z);
	    vec3 specularLight = SRGBtoLINEAR(textureCube(u_SpecularEnvSampler, -reverse_reflection, lod)).rgb;
    #else
        vec3 specularLight = SRGBtoLINEAR(textureCube(u_SpecularEnvSampler, -reflection, lod)).rgb;
    #endif
#endif

    vec3 diffuse = diffuseLight * pbrInputs.diffuseColor;
    vec3 specular = specularLight * (pbrInputs.specularColor * brdf.x + brdf.y);

	diffuse *= u_ScaleIBLDiffuse;	
    specular *= u_ScaleIBLSpecular;

	return diffuse + specular; // original
}
#endif

// Basic Lambertian diffuse
// Implementation from Lambert's Photometria https://archive.org/details/lambertsphotome00lambgoog
// See also [1], Equation 1
vec3 diffuse(PBRInfo pbrInputs)
{
    return pbrInputs.diffuseColor / M_PI;
}

// The following equation models the Fresnel reflectance term of the spec equation (aka F())
// Implementation of fresnel from [4], Equation 15
vec3 specularReflection(PBRInfo pbrInputs)
{
    return pbrInputs.reflectance0 + (pbrInputs.reflectance90 - pbrInputs.reflectance0) * pow(clamp(1.0 - pbrInputs.VdotH, 0.0, 1.0), 5.0);
}

// This calculates the specular geometric attenuation (aka G()),
// where rougher material will reflect less light back to the viewer.
// This implementation is based on [1] Equation 4, and we adopt their modifications to
// alphaRoughness as input as originally proposed in [2].
float geometricOcclusion(PBRInfo pbrInputs)
{
    float NdotL = pbrInputs.NdotL;
    float NdotV = pbrInputs.NdotV;
    float r = pbrInputs.alphaRoughness;

    float attenuationL = 2.0 * NdotL / (NdotL + sqrt(r * r + (1.0 - r * r) * (NdotL * NdotL)));
    float attenuationV = 2.0 * NdotV / (NdotV + sqrt(r * r + (1.0 - r * r) * (NdotV * NdotV)));
    return attenuationL * attenuationV;
}

float GeometrySchlickGGX(float NdotV, float k)
{
    float nom   = NdotV;
    float denom = NdotV * (1.0 - k) + k;
	
    return nom / denom;
}

float geometryFunction(PBRInfo pbrInputs)
{
	float k = (pbrInputs.alphaRoughness + 1.0)*(pbrInputs.alphaRoughness + 1.0)/8.0;

	float NdotL = pbrInputs.NdotL;
    float NdotV = pbrInputs.NdotV;
    float ggx1 = GeometrySchlickGGX(NdotV, k);
    float ggx2 = GeometrySchlickGGX(NdotL, k);
	
    return ggx1 * ggx2;
	
}

// The following equation(s) model the distribution of microfacet normals across the area being drawn (aka D())
// Implementation from "Average Irregularity Representation of a Roughened Surface for Ray Reflection" by T. S. Trowbridge, and K. P. Reitz
// Follows the distribution function recommended in the SIGGRAPH 2013 course notes from EPIC Games [1], Equation 3.
float microfacetDistribution(PBRInfo pbrInputs)
{
    float roughnessSq = pbrInputs.alphaRoughness * pbrInputs.alphaRoughness;
	float g = ((pbrInputs.NdotH*pbrInputs.NdotH)*(roughnessSq - 1.0) + 1.0);
	return roughnessSq / (M_PI * g * g);
}

void main()
{
	// Metallic and Roughness material properties are packed together
    // In glTF, these factors can be specified by fixed scalar values
    // or from a metallic-roughness map
    float perceptualRoughness = u_RoughnessValue;
    float metallic = u_MetallicValue;

    // Roughness is stored in the 'g' channel, metallic is stored in the 'b' channel.
    // This layout intentionally reserves the 'r' channel for (optional) occlusion map data
#ifdef HAS_METALROUGHNESSMAP
    vec4 mrSample = texture2D(u_MetallicRoughnessSampler, v_UV);
    perceptualRoughness = mrSample.g * perceptualRoughness;
    metallic = mrSample.b * metallic;
#endif

#ifdef SPECULAR_GLOSSINESS
    float roughness = u_GlossinessFactor;
    #ifdef HAS_SPECULAR_GLOSSINESSMAP
	    roughness = texture2D( u_MetallicRoughnessSampler, v_UV ).a * u_GlossinessFactor;
    #endif

    perceptualRoughness = 1.0 - roughness;
#endif

    perceptualRoughness = clamp(perceptualRoughness, c_MinRoughness, 1.0);
    metallic = clamp(metallic, 0.0, 1.0);
    // Roughness is authored as perceptual roughness; as is convention,
    // convert to material roughness by squaring the perceptual roughness [2].
    float alphaRoughness = perceptualRoughness * perceptualRoughness;
	
	#ifdef HAS_BASECOLORMAP
		vec4 baseColor = SRGBtoLINEAR(texture2D(u_BaseColorSampler, v_UV)) * u_BaseColorFactor;		
		#ifdef VERTEX_COLOR
			vec3 vertexColorLinear = mysRGBToLinear(v_VertexColor.rgb, DefaultGamma );
			if(vertexColorLinear.rgb != vec3(0.0) && v_VertexColor.a != 0.0)
			{
				baseColor *= v_VertexColor;
				baseColor.a *= v_VertexColor.a;
			}	
		#endif		
	#else
        vec4 baseColor = u_BaseColorFactor;
        #ifdef VERTEX_COLOR
			vec3 vertexColorLinear = mysRGBToLinear(v_VertexColor.rgb, DefaultGamma );
			if(vertexColorLinear.rgb != vec3(0.0) && v_VertexColor.a != 0.0)
			{
				baseColor *= v_VertexColor;
				baseColor.a *= v_VertexColor.a;
			}	
        #endif
	#endif

	#ifdef MASK_CUTOFF
        if(baseColor.a < u_alphaCutoff)
            discard;
    #endif

    vec3 f0 = vec3(0.04);
    vec3 diffuseColor = baseColor.rgb * (vec3(1.0) - f0);
    diffuseColor *= 1.0 - metallic;
    vec3 specularColor = mix(f0, baseColor.rgb, metallic);

    // Compute reflectance.
    float reflectance = max(max(specularColor.r, specularColor.g), specularColor.b);

	
	#ifdef SPECULAR_GLOSSINESS
		diffuseColor = baseColor.rgb * (1 - max(max(specularColor.r, specularColor.g), specularColor.b));
        specularColor = u_SpecularFactor;

        #ifdef HAS_SPECULAR_GLOSSINESSMAP
		    specularColor = mysRGBToLinear(texture2D( u_MetallicRoughnessSampler, v_UV), DefaultGamma).rgb * u_SpecularFactor;
        #endif
	#endif
	
    // For typical incident reflectance range (between 4% to 100%) set the grazing reflectance to 100% for typical fresnel effect.
    // For very low reflectance range on highly diffuse objects (below 4%), incrementally reduce grazing reflecance to 0%.
    float reflectance90 = clamp(reflectance * 25.0, 0.0, 1.0);
    vec3 specularEnvironmentR0 = specularColor.rgb;
    vec3 specularEnvironmentR90 = vec3(1.0, 1.0, 1.0) * reflectance90;

	vec3 u_Camera = osg_ViewMatrixInverse[3].xyz;
	vec3 u_CameraOSG = osg_ViewMatrixInverse[3].xyz;
		
    vec3 v = normalize(u_Camera - v_Position);        	// Vector from surface point to camera
	vec3 camera = normalize(u_Camera);
	vec3 n = getNormalTheBestOfTheBest();
    vec3 l = normalize(u_LightDirection);             	// Vector from surface point to light	
    vec3 h = normalize(l+v);                          	// Half vector between both l and v
	vec3 reflection = -normalize(reflect(v, n));
	
    float NdotL = clamp(dot(n, l), 0.001, 1.0);
    float NdotV = clamp(abs(dot(n, v)), 0.001, 1.0);
    float NdotH = clamp(dot(n, h), 0.0, 1.0);
    float LdotH = clamp(dot(l, h), 0.0, 1.0);
    float VdotH = clamp(dot(v, h), 0.0, 1.0);
	
    PBRInfo pbrInputs = PBRInfo(
        NdotL,
        NdotV,
        NdotH,
        LdotH,
        VdotH,
        perceptualRoughness,
        metallic,
        specularEnvironmentR0,
        specularEnvironmentR90,
        alphaRoughness,
        diffuseColor,
        specularColor
    );

    // Calculate the shading terms for the microfacet specular shading model
	vec3 F;
	#ifdef SPECULAR_GLOSSINESS
        F = u_SpecularFactor;
        #ifdef HAS_SPECULAR_GLOSSINESSMAP
		    F = mysRGBToLinear(texture2D( u_MetallicRoughnessSampler, v_UV), DefaultGamma).rgb * u_SpecularFactor;
        #endif
	#else
		F = specularReflection(pbrInputs);
	#endif
	
	float G = geometryFunction(pbrInputs);
    float D = microfacetDistribution(pbrInputs);

    // Calculation of analytical lighting contribution	// direct light
    vec3 diffuseContrib = (1.0 - F) * diffuse(pbrInputs);
    vec3 specContrib = F * G * D / (4.0 * NdotL * NdotV);
	
    // Obtain final intensity as reflectance (BRDF) scaled by the energy of the light (cosine law)
    vec3 color = NdotL * u_LightColor * (specContrib + diffuseContrib);
	
	#ifdef USE_IBL
		color += getIBLContribution(pbrInputs, n, reflection);	
	#endif
	
	#ifdef HAS_OCCLUSIONMAP
		float ao = texture2D(u_OcclusionSampler, v_UV).r;
		color = mix(color, color * ao, 1.0);
		color += vec3(0.03)*baseColor.rgb*ao;
	#endif
				
	#ifdef HAS_EMISSIVEMAP	
		vec3 emissive = SRGBtoLINEAR(texture2D(u_EmissiveSampler, v_UV)).rgb * u_EmissiveFactor;
	#else
		vec3 emissive = u_EmissiveFactor;	
	#endif

    #ifdef KHR_MATERIALS_EMISSIVE_STRENGTH
	        emissive *= u_EmissiveStrength;
	#endif

	color += emissive; 

	#ifdef USE_HDR
		vec2 myUV = SampleSphericalMap(normalize(v_Position));
		vec3 myColor = texture(u_equirectangularMap, myUV).rgb;
		color = myColor;
	#endif
			
	#ifdef HAS_BLENDING
		gl_FragColor = vec4(diffuseColor, baseColor.a);
	#else
		gl_FragColor = vec4(pow(color,vec3(1.0/2.2)), baseColor.a);
	#endif

	#ifdef KHR_MATERIALS_UNLINT
		gl_FragColor = baseColor;
	#endif
}
