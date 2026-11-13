var AstraPlanet = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // planet.js
  var planet_exports = {};
  __export(planet_exports, {
    buildPlanet: () => buildPlanet
  });
  function buildPlanet({ THREE, radius, detail }) {
    const segments = detail === "near" ? 128 : 32;
    const root = new THREE.Group();
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius, segments, segments / 2),
      new THREE.MeshStandardMaterial({ color: 5089023, roughness: 0.68 })
    );
    sphere.name = "surface";
    sphere.userData.astraSurface = true;
    root.add(sphere);
    return root;
  }
  return __toCommonJS(planet_exports);
})();
