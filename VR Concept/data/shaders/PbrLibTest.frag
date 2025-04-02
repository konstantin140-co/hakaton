#define DefaultGamma 2.4

#ifdef USE_GEN_UV_BACKCOLOR_TEX
	uniform sampler2D u_UserMaterialDiffuseEnvSampler2D;
	uniform vec3 u_CubeBaseColorTranslation; 		//Vector displacement of the attachment point, allows you to "shift" the generated texture
	uniform vec3 u_CubeBaseColorScale; 		 		//Scaling the texture, allows you to "stretch" the generated texture
	uniform float u_TextureScale;					//Texture Scale
#endif
#ifdef USE_IBL

	#ifdef USE_SPHERICAL_MAPS
		uniform sampler2D u_SpecularEnvSampler;
	#else
		uniform samplerCube u_SpecularEnvSampler;
	#endif
	uniform samplerCube u_DiffuseEnvSampler;
	uniform sampler2D u_brdfLUT;
	uniform float u_ScaleIBLSpecular;			// Light reflectance coefficient
	uniform float u_ScaleIBLDiffuse;			// Light diffuse coefficient
#endif

#ifdef HAS_OCCLUSIONMAP
	uniform sampler2D u_OcclusionSampler;
	uniform float u_OcclusionStrength;
#endif

uniform vec3 u_LightDir;
uniform vec3 u_LightColor;
uniform mat4 osg_ViewMatrixInverse;
uniform vec2 u_MetallicRoughnessValues;
uniform float u_MetallicValue;
uniform float u_RoughnessValue;
uniform float u_GlossinessFactor;
uniform vec3 u_SpecularFactor;
uniform vec4 u_BaseColorFactor;

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
	uniform vec3 u_EmissiveFactor;
#endif

uniform sampler2D u_MetallicRoughnessSampler;
varying vec3 v_Position;
varying vec2 v_UV;
varying vec3 v_Normal;
varying vec4 v_VertexColor;
varying vec3 v_ModelPos;

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

vec4 SRGBtoLINEAR(vec4 srgbIn)
{
    #ifdef MANUAL_SRGB
		#ifdef SRGB_FAST_APPROXIMATION
			vec3 linOut = pow(srgbIn.xyz,vec3(2.2));
		#else  //SRGB_FAST_APPROXIMATION
			vec3 bLess = step(vec3(0.04045),srgbIn.xyz);
			vec3 linOut = mix( srgbIn.xyz/vec3(12.92), pow((srgbIn.xyz+vec3(0.055))/vec3(1.055),vec3(2.4)), bLess );
		#endif //SRGB_FAST_APPROXIMATION
		return vec4(linOut,srgbIn.w);;
	#else //MANUAL_SRGB
		return srgbIn;
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
		#ifdef USE_TEX_LOD
			vec3 specularLight = SRGBtoLINEAR(
				textureCubeLodEXT(u_SpecularEnvSampler,
				vec3(-reflection.z, reflection.y, -reflection.x), lod)
				).rgb;
		#else
			vec3 specularLight = SRGBtoLINEAR(textureCube(u_SpecularEnvSampler, 
				vec3(-reflection.z, reflection.y, reflection.x))
				).rgb;
		#endif
	#else
		#ifdef USE_TEX_LOD
			vec3 specularLight = SRGBtoLINEAR(textureCubeLodEXT(u_SpecularEnvSampler,
				-vec3(-reflection.z, reflection.y, reflection.x), lod)
				).rgb;
		#else
			vec3 specularLight = SRGBtoLINEAR(textureCube(u_SpecularEnvSampler, 
				-vec3(-reflection.z, reflection.y, reflection.x))
				).rgb;
		#endif
	#endif
#endif
    vec3 diffuse = diffuseLight * pbrInputs.diffuseColor;
    vec3 specular = specularLight * (pbrInputs.specularColor * brdf.x + brdf.y);
    diffuse *= u_ScaleIBLDiffuse;
    specular *= u_ScaleIBLSpecular;
	return diffuse + specular;
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
	float k = (pbrInputs.alphaRoughness + 1 )*(pbrInputs.alphaRoughness + 1 )/8;

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
	float g = ((pbrInputs.NdotH*pbrInputs.NdotH)*(roughnessSq - 1) + 1);
	return roughnessSq / (M_PI * g * g);
}

vec4 getUserTextureContribute(const vec3 vpos, const sampler2D userTexture, const float textureScale)
{
	const vec3 P0 = vpos;
	float rotateAroundZ = 0.0;
	if(P0.x > P0.y)
		rotateAroundZ = (P0.x < -P0.y) ? M_PI : M_PI/2.0;
	else
		if(P0.x < -P0.y) rotateAroundZ = -M_PI/2.0;

	mat3 rotMatrixZ = mat3(
		cos(rotateAroundZ), -sin(rotateAroundZ), 0,
		sin(rotateAroundZ), cos(rotateAroundZ), 0,
		0, 0, 1);
		
	vec3 P1 = rotMatrixZ * P0;
	float rotateAroundX = 0.0;

	if(P1.z > abs(P1.y)) 
		rotateAroundX = -M_PI/2.0;
	if(P1.z < -abs(P1.y)) 
		rotateAroundX = -M_PI/2.0;
		
	mat3 rotMatrixX = mat3(
		1, 0, 0,
		0, cos(rotateAroundX), -sin(rotateAroundX),
		0, sin(rotateAroundX), cos(rotateAroundX)
		);
	
	vec3 P2 = rotMatrixX * P1;

	mat3 rotMatrixY = mat3(
		cos(rotateAroundZ), 0, sin(rotateAroundZ),
		0, 1, 0,
		-sin(rotateAroundZ), 0, cos(rotateAroundZ)
		);
		
	vec3 P3 = rotMatrixY * P2;
	
	return texture2D(userTexture, P3.xz * textureScale);
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
    perceptualRoughness = clamp(perceptualRoughness, c_MinRoughness, 1.0);
    metallic = clamp(metallic, 0.0, 1.0);
    // Roughness is authored as perceptual roughness; as is convention,
    // convert to material roughness by squaring the perceptual roughness [2].
    float alphaRoughness = perceptualRoughness * perceptualRoughness;
	vec4 baseColor = u_BaseColorFactor;
	vec3 normalizedCoords = normalize(v_ModelPos);

	#ifdef USE_GEN_UV_BACKCOLOR_TEX
		baseColor.xyz *= getUserTextureContribute(
		u_CubeBaseColorScale * v_ModelPos + u_CubeBaseColorTranslation,
		u_UserMaterialDiffuseEnvSampler2D,
		u_TextureScale);
	#endif
	#ifdef VERTEX_COLOR
		baseColor *= v_VertexColor;
		baseColor.a *= v_VertexColor.a;
	#endif
	
    vec3 f0 = vec3(0.04);
    vec3 diffuseColor = baseColor.rgb * (vec3(1.0) - f0);
    diffuseColor *= 1.0 - metallic;
    vec3 specularColor = mix(f0, baseColor.rgb, metallic);

    // Compute reflectance.
    float reflectance = max(max(specularColor.r, specularColor.g), specularColor.b);
	
    // For typical incident reflectance range (between 4% to 100%) set the grazing reflectance to 100% for typical fresnel effect.
    // For very low reflectance range on highly diffuse objects (below 4%), incrementally reduce grazing reflecance to 0%.
    float reflectance90 = clamp(reflectance * 25.0, 0.0, 1.0);
    vec3 specularEnvironmentR0 = specularColor.rgb;
    vec3 specularEnvironmentR90 = vec3(1.0, 1.0, 1.0) * reflectance90;
	vec3  u_Camera = osg_ViewMatrixInverse[3].xyz;
	vec3  u_CameraOSG = osg_ViewMatrixInverse[3].xyz;
    vec3 v = normalize(u_Camera - v_Position);        	// Vector from surface point to camera
	vec3 camera = normalize(u_Camera);
	vec3 n = getNormalTheBestOfTheBest();
    vec3 l = normalize(-u_LightDir);             		// Vector from surface point to light	
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
	vec3 F = specularReflection(pbrInputs);
	float G = geometryFunction(pbrInputs);
    float D = microfacetDistribution(pbrInputs);

    // Calculation of analytical lighting contribution

	vec3 diffuseContrib = (1.0 - F) * diffuse(pbrInputs);
    vec3 specContrib = F * G * D / (4.0 * NdotL * NdotV);
    // Obtain final intensity as reflectance (BRDF) scaled by the energy of the light (cosine law)
    vec3 color = NdotL * u_LightColor * (specContrib + diffuseContrib);
	
	#ifdef USE_IBL
		color += getIBLContribution(pbrInputs, n, reflection);	
	#endif
	
	#ifdef HAS_OCCLUSIONMAP
		float ao = texture2D(u_OcclusionSampler, v_UV).r;
		color = mix(color, color * ao, u_OcclusionStrength);
		color += vec3(0.03)*baseColor*ao;
	#endif
			
	#ifdef HAS_EMISSIVEMAP	
		vec3 emissive = SRGBtoLINEAR(texture2D(u_EmissiveSampler, v_UV)).rgb * u_EmissiveFactor;
		color += emissive;
	#endif
	
	#ifdef USE_HDR
		vec2 myUV = SampleSphericalMap(normalize(v_Position));
		vec3 myColor = texture(u_equirectangularMap, myUV).rgb;
		color = myColor;
	#endif
	
	gl_FragColor = vec4(pow(color,vec3(1.0/2.2)), baseColor.a);;
}