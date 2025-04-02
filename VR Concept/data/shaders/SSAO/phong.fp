#version 120

varying vec3 vertNormal;
varying vec4 vertColor;
varying vec4 vertPosition;

uniform vec3 u_LightDirection;		// light Direction from VR Concept

vec3 phong(vec3 normal, vec3 lightPosition, vec3 position, vec3 ka, vec3 kd, vec3 ks, float shine)
{
	vec3 s = normalize(lightPosition);
	vec3 v = normalize(vec3(-position));
	vec3 r = reflect(-s, normal);
	return ka + kd * max( dot(s, normal), 0.0 ) + ks * pow(max(dot(r,v), 0.0), shine);
}

void main(void)
{
	vec3 n = normalize(vertNormal);
	vec3 lightPosition = vec3(0); // headlight

	vec3 color = phong(n, u_LightDirection, vertPosition.xyz, vec3(0), vertColor.rgb, vec3(0), 16.0f);
	
	// Color buffer
	gl_FragData[0] = vertColor;

	// Normal buffer
	gl_FragData[1] = vec4(n * 0.5 + 0.5, 1.0);
}
