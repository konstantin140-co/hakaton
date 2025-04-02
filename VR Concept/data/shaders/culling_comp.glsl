#ifndef ThreadGroupCountX
#define ThreadGroupCountX 1
#endif

#define Plane vec4

struct frustum_class{ 
Plane planes[6];
uvec4 nearPointMasks;
uvec4 nearPointMasks2;
};

struct cbdata_class {
frustum_class frustum;
#ifdef USE_OCCLUSION_CULLING
vec4 view_proj;
#endif
vec4 camera_pos;
uvec2 viewport;
};

layout(binding=0,std140) uniform cbdata_classBlock {cbdata_class cbdata;};
#define indirect_instance indirect[gl_GlobalInvocationID.x]
struct indirect_class{ 
uint count;
uint instanceCount;
uint firstIndex;
uint baseVertex;
uint baseInstance;
};
layout(binding=1,std430) restrict buffer indirect_classBlock {indirect_class  indirect [];};
#define culling_instance culling[gl_GlobalInvocationID.x]
struct culling_class{ 
vec4 box_min_point;
vec4 box_max_point;
vec4 sphere_pos;
};
layout(binding=2,std430) readonly restrict buffer culling_classBlock {culling_class  culling [];};

layout(local_size_x = ThreadGroupCountX) in;

float SignedDistanceToPoint(in Plane plane, in vec3 p) {
	return dot(plane.xyz, p) + plane.w;
}

bool PointIsVisible(in Plane plane, in vec3 p) {
	float Dist = SignedDistanceToPoint(plane, p);
	return Dist >= 0.0f;
}

vec3 MakeNearPoint(uint nearPointMask, in vec3 minPoint, in vec3 maxPoint) {
	return vec3((nearPointMask & 1) != 0 ? maxPoint.x : minPoint.x,
	(nearPointMask & 2) != 0 ? maxPoint.y : minPoint.y,
	(nearPointMask & 4) != 0 ? maxPoint.z : minPoint.z);
}

vec3 MakeFarPoint(uint nearPointMask, in vec3 minPoint, in vec3 maxPoint) {
	return vec3((nearPointMask & 1) != 0 ? minPoint.x : maxPoint.x,
	(nearPointMask & 2) != 0 ? minPoint.y : maxPoint.y,
	(nearPointMask & 4) != 0 ? minPoint.z : maxPoint.z);
}

bool PointsIsVisible(const Plane plane, uint nearPointMask, in vec3 minPoint, in vec3 maxPoint) {
	const vec3 nearPoint = MakeNearPoint(nearPointMask, minPoint, maxPoint);
	bool res = PointIsVisible(plane, nearPoint);
	if (!res) {
		const vec3 farPoint = MakeFarPoint(nearPointMask, minPoint, maxPoint);
		res = PointIsVisible(plane, farPoint);
	}
	return res;
}

bool CameraInBox(in vec4 cam_pos, in vec4 minPoint, in vec4 maxPoint) {
	return cam_pos.x >= minPoint.x && cam_pos.y >= minPoint.y && cam_pos.z >= minPoint.z && 
			cam_pos.x <= maxPoint.x && cam_pos.y <= maxPoint.y && cam_pos.z <= maxPoint.z;
}

bool SphereInFrustum(in vec4 sphere) {
bool res = true;
for (lowp uint i = 0; i < 6; ++i) {
	res = SignedDistanceToPoint(cbdata.frustum.planes[i], sphere.xyz) > -sphere.w;
	if (!res) {
	break;
	}
}
return res;
}

bool BoundingBoxInFrustum(in vec4 minPoint, in vec4 maxPoint) {
	bool res = true;
	for (uint i = 0; i < 4; ++i) {
		const Plane plane = cbdata.frustum.planes[i];
		uint nearPointMask = cbdata.frustum.nearPointMasks[i];
		res = PointsIsVisible(plane, nearPointMask, minPoint.xyz, maxPoint.xyz);
		if (!res) {
			break;
		}
	}
	if (res) {
		for (uint i = 0; i < 2; ++i) {
			const Plane plane = cbdata.frustum.planes[i + 4];
			uint nearPointMask = cbdata.frustum.nearPointMasks2[i];
			res = PointsIsVisible(plane, nearPointMask, minPoint.xyz, maxPoint.xyz);
			if (!res) {
				break;
			}
		}
	}
	return res;
}


void main() {
	if (indirect_instance.count != 0) {
		if (SphereInFrustum(culling_instance.sphere_pos)) {
			if (BoundingBoxInFrustum(culling_instance.box_min_point,culling_instance.box_max_point)) {
				indirect_instance.instanceCount = 1;
				return;
			}
		}
	indirect_instance.instanceCount = 0;
	}
}
