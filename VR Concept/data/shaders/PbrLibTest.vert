//PBR Material vertex shader
#pragma import_defines (USE_CLIPPER)
uniform mat4 osg_ViewMatrixInverse;

varying vec3 v_Position;
varying vec3 v_ModelPos;
varying vec2 v_UV;
varying vec3 v_Normal;
varying vec4 v_VertexColor;
attribute vec2 tex_coords; 
attribute vec2 a_UV;

uniform vec4 u_CullPlanes[8];
void main()
{
	v_ModelPos = gl_Vertex.xyz;
	mat4 modelMatrix = osg_ViewMatrixInverse * gl_ModelViewMatrix;

	vec4 pos = modelMatrix * gl_Vertex;								
	v_Normal = normalize(vec3(modelMatrix * vec4(gl_Normal.xyz, 0.0)));
	v_Position = vec3(pos.xyz) / pos.w;
	v_UV = gl_MultiTexCoord0.xy;
	v_VertexColor = gl_Color;
	#ifdef USE_CLIPPER
		for(int i = 0; i < 8; ++i) {
			vec4 cullPlaneInverse = -u_CullPlanes[i];
			gl_ClipDistance[i] = dot(pos, cullPlaneInverse);
		}
	#endif
	gl_Position = gl_ModelViewProjectionMatrix * gl_Vertex;
}