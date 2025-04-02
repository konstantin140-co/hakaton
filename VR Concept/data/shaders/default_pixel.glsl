#ifndef GENERATED
layout(location=1) in vec3 innormal;
layout(location=2) in vec3 infrag_pos;
layout(location=3) in vec2 inuv;
layout(location=0) out vec4 outcolour;
struct AmbientLightBlock {
    vec4 color;
    vec4 direction;
};

uniform AmbientLightBlock ambient_light;

layout(std140) uniform camera {
    mat4 view;
    mat4 projection;
    vec4 position;
};

layout(std140) uniform ds_material_instance {
    vec4 material;
};
#endif

uniform uvec2 testSampler;     // mySampler is bindless

void main() {
    vec4 AmbientColor =
    vec4(ambient_light.color.rgb * ambient_light.color.a, 1.0f);
    vec4 DiffuseColor = vec4(0, 0, 0, 1);
    vec4 SpecularColor = vec4(0, 0, 0, 0);
    // sampler2D SpecularTexture = sampler2D(specular_instance);
    float DiffuseFactor = dot(innormal, -ambient_light.direction.xyz);
    if (DiffuseFactor > 0) {
        DiffuseColor =
        vec4(ambient_light.color.rgb * ds_material_instance(material).x *
        DiffuseFactor,
        1.0f);
        float SpecularFactor =
        dot(normalize(camera.position.xyz - infrag_pos),
        normalize(reflect(ambient_light.direction.xyz, innormal)));
        if (SpecularFactor > 0) {
            SpecularFactor = pow(SpecularFactor, ds_material_instance(material).z);
            SpecularColor =
            vec4(ambient_light.color.rgb *
            ds_material_instance(material).y * SpecularFactor,
            1.0f);
        }
    }

    //outcolour = texture(diffuse_instance, inuv);
    outcolour = AmbientColor + DiffuseColor + SpecularColor;
} 
