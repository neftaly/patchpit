precision mediump float;

uniform vec4 u_color;
uniform vec4 u_lightColor;
uniform vec3 u_lightDirection;

varying vec3 v_normal;

void main() {
  float light = max(dot(normalize(v_normal), normalize(-u_lightDirection)), 0.0);
  vec3 rgb = u_color.rgb * (0.18 + light * u_lightColor.rgb);
  gl_FragColor = vec4(rgb, u_color.a);
}
