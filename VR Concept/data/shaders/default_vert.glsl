out gl_PerVertex { vec4 gl_Position; };

#ifndef GENERATED
in vec4 inpos;
in vec3 innormal;
in vec2 inuv;
out vec3 outfrag_pos;
out vec3 outnormal;
out vec2 outuv;
layout(std140) uniform object_instance {
    mat4 model;
    mat4 mvp;
};
#endif

void main() {
    gl_Position = camera.view_proj * object_instance(model) * vec4(inpos, 1.f);
    outfrag_pos = vec3(object_instance(model) * vec4(inpos, 1.f));
    outnormal = normalize(vec3(object_instance(model) * vec4(innormal, 0.0)));
    outuv = inuv;
    // TODO: Find end of main and add this line automaticly
    base_instance = gl_BaseInstance;
}
