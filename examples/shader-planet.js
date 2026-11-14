// Copy this file to a planet repository as planet.js. No imports are needed.
export function buildPlanet({ THREE, radius, detail }) {
  const root = new THREE.Group();
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(radius, detail === "near" ? 64 : 24, detail === "near" ? 32 : 12),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec3 vLocalPosition;
        void main() {
          vLocalPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec3 vLocalPosition;
        void main() {
          float stripe = 0.5 + 0.5 * sin(normalize(vLocalPosition).y * 24.0 + uTime);
          vec3 color = mix(vec3(0.03, 0.12, 0.25), vec3(0.12, 0.55, 0.85), stripe);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    }),
  );
  surface.userData.astraSurface = true;
  root.add(surface);
  return root;
}
