"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  clampRackRotation,
  clampRackZoom,
  focusCameraFrame,
  garmentKind,
  rackLayout,
  sceneGarments,
} from "./scene-geometry";
import { createGarment, createRack, disposeObject } from "./scene-model";
import type { RackGarment, RackSceneProps } from "./scene-types";

type GarmentState = {
  group: THREE.Group;
  x: number;
  shelf: boolean;
  targetZ: number;
  targetYaw: number;
  targetScale: number;
};

type SceneController = { update: () => void };

export default function RackScene(props: RackSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  const controllerRef = useRef<SceneController | null>(null);
  propsRef.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "default",
      });
    } catch {
      propsRef.current.onUnavailable();
      return;
    }
    let disposed = false;
    let unavailable = false;
    let frame = 0;
    let lastTime = 0;
    let ready = false;
    let sceneWidth = 5;
    let previousItems: RackGarment[] | null = null;
    let previousMode: RackSceneProps["mode"] | null = null;
    let previousFocusId: string | null = null;
    let focusBounds = new THREE.Box3();
    let focusTilt = 0.025;
    let previousLight: RackSceneProps["light"] | null = null;
    let targetRotation =
      (clampRackRotation(propsRef.current.rotation, propsRef.current.mode) *
        Math.PI) /
      180;
    let targetZoom = clampRackZoom(propsRef.current.zoom);
    let zoom = targetZoom;
    let isVisible = true;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e9e8df");
    const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 70);
    camera.position.set(0, 3.2, 11);
    camera.lookAt(0, 1.95, 0);
    const rackRoot = new THREE.Group();
    rackRoot.rotation.y = targetRotation;
    scene.add(rackRoot);
    const clothes = new Map<string, GarmentState>();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    const canvas = renderer.domElement;
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      propsRef.current.ariaLabel ?? "3D wardrobe",
    );
    canvas.style.cssText =
      "display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab";
    host.appendChild(canvas);

    const hemi = new THREE.HemisphereLight("#ffffff", "#b6b29e", 2.35);
    const key = new THREE.DirectionalLight("#fff9eb", 3.3);
    key.position.set(-3, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -6;
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 25;
    key.shadow.normalBias = 0.025;
    key.shadow.bias = -0.00015;
    key.shadow.radius = 4;
    const fill = new THREE.DirectionalLight("#e6edee", 1.45);
    fill.position.set(4, 4, -3);
    scene.add(hemi, key, fill);
    const floorSurface = new THREE.MeshStandardMaterial({
      color: "#e1e1d6",
      roughness: 1,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), floorSurface);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.012;
    floor.receiveShadow = true;
    scene.add(floor);

    // A local procedural studio supplies metal reflections without loading assets.
    const studio = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    let environment: THREE.WebGLRenderTarget | null = null;
    try {
      environment = pmrem.fromScene(studio, 0.025);
      scene.environment = environment.texture;
      scene.environmentIntensity = 0.72;
    } catch {
      // Diffuse lighting remains usable on devices without this optional reflection map.
    } finally {
      studio.dispose();
      pmrem.dispose();
    }

    const updateCamera = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const aspect = width / height;
      const focus = propsRef.current.mode === "focus";
      let halfHeight: number;
      if (focus) {
        halfHeight = focusCameraFrame(
          focusBounds,
          aspect,
          focusTilt,
        ).halfHeight;
        camera.position.set(
          0,
          Math.sin(focusTilt) * 11,
          Math.cos(focusTilt) * 11,
        );
        camera.lookAt(0, 0, 0);
      } else {
        // The complete rail fits even on a narrow phone, including when it is rotated.
        halfHeight = Math.max(4.7, (sceneWidth + 0.95) / aspect) / 2;
        camera.position.set(0, 3.2, 11);
        camera.lookAt(0, 1.95, 0);
      }
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
    };

    const requestFrame = () => {
      if (disposed || unavailable || frame || !isVisible || document.hidden)
        return;
      frame = window.requestAnimationFrame(render);
    };

    const render = (now: number) => {
      frame = 0;
      if (disposed || unavailable) return;
      const elapsed = lastTime ? Math.min(50, now - lastTime) : 16;
      lastTime = now;
      const factor = propsRef.current.reducedMotion
        ? 1
        : 1 - Math.exp(-elapsed / 95);
      let moving = false;
      const approach = (current: number, target: number) => {
        if (Math.abs(current - target) < 0.001) return target;
        moving = true;
        return THREE.MathUtils.lerp(current, target, factor);
      };
      rackRoot.rotation.y = approach(rackRoot.rotation.y, targetRotation);
      zoom = approach(zoom, targetZoom);
      for (const state of Array.from(clothes.values())) {
        state.group.position.z = approach(
          state.group.position.z,
          state.targetZ,
        );
        state.group.rotation.y = approach(
          state.group.rotation.y,
          state.targetYaw,
        );
        const scale = approach(state.group.scale.x, state.targetScale);
        state.group.scale.setScalar(scale);
      }
      updateCamera();
      try {
        renderer.render(scene, camera);
        if (!ready) {
          ready = true;
          propsRef.current.onReady();
        }
      } catch {
        unavailable = true;
        propsRef.current.onUnavailable();
      }
      if (moving) requestFrame();
    };

    const update = () => {
      if (disposed || unavailable) return;
      const current = propsRef.current;
      canvas.setAttribute("aria-label", current.ariaLabel ?? "3D wardrobe");
      const mode = current.mode ?? "rack";
      const focusId = mode === "focus" ? current.selectedId : null;
      targetRotation =
        (clampRackRotation(current.rotation, mode) * Math.PI) / 180;
      targetZoom = clampRackZoom(current.zoom);
      floor.visible = mode !== "focus";
      if (
        previousItems !== current.items ||
        previousMode !== mode ||
        previousFocusId !== focusId
      ) {
        previousItems = current.items;
        previousMode = mode;
        previousFocusId = focusId;
        disposeObject(rackRoot);
        clothes.clear();
        const visibleItems = sceneGarments(
          current.items,
          current.selectedId,
          mode,
        );
        const layout = rackLayout(visibleItems);
        sceneWidth = layout.width;
        if (mode === "rack") rackRoot.add(createRack(layout.width));
        focusBounds = new THREE.Box3();
        const byId = new Map(visibleItems.map((item) => [item.id, item]));
        for (const slot of [...layout.hanging, ...layout.shelf]) {
          const item = byId.get(slot.id);
          if (!item) continue;
          const shelf = layout.shelf.some((value) => value.id === slot.id);
          const group = createGarment(item);
          if (mode === "focus") {
            focusBounds.setFromObject(group);
            focusTilt = garmentKind(item.type) === "shoes" ? 0.42 : 0.025;
            group.position.sub(
              focusCameraFrame(focusBounds, 1, focusTilt).center,
            );
          } else group.position.set(slot.x, shelf ? 0.39 : 3.31, 0);
          rackRoot.add(group);
          clothes.set(item.id, {
            group,
            x: slot.x,
            shelf,
            targetZ: 0,
            targetYaw: 0,
            targetScale: 1,
          });
        }
      }
      for (const [id, state] of Array.from(clothes)) {
        const selected = id === current.selectedId;
        state.targetZ =
          mode === "focus"
            ? state.group.position.z
            : selected
              ? state.shelf
                ? 0.28
                : 0.7
              : -0.035;
        state.targetYaw = mode === "focus" ? 0 : selected ? 0.1 : -0.18;
        state.targetScale =
          mode === "focus" ? 1 : selected ? (state.shelf ? 1.17 : 1.035) : 0.91;
      }
      if (previousLight !== current.light) {
        previousLight = current.light;
        const day = current.light === "day";
        scene.background = new THREE.Color(day ? "#e9e8df" : "#d5d8d1");
        floorSurface.color.set(day ? "#e1e1d6" : "#cbd0c8");
        key.color.set(day ? "#fff7e7" : "#ffffff");
        key.intensity = day ? 3.3 : 4.2;
        hemi.intensity = day ? 2.35 : 1.6;
        fill.intensity = day ? 1.45 : 2.5;
        renderer.toneMappingExposure = day ? 1.1 : 0.96;
      }
      requestFrame();
    };
    controllerRef.current = { update };

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      updateCamera();
      requestFrame();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    const intersection =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            isVisible = entries[0]?.isIntersecting ?? true;
            if (isVisible) requestFrame();
          })
        : null;
    intersection?.observe(host);

    let drag: {
      id: number;
      startX: number;
      startY: number;
      rotation: number;
      horizontal: boolean;
      vertical: boolean;
    } | null = null;
    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || drag) return;
      drag = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        rotation: clampRackRotation(
          propsRef.current.rotation,
          propsRef.current.mode,
        ),
        horizontal: false,
        vertical: false,
      };
    };
    const pointerMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (
        !drag.horizontal &&
        !drag.vertical &&
        Math.max(Math.abs(dx), Math.abs(dy)) > 7
      ) {
        if (Math.abs(dx) > Math.abs(dy)) {
          drag.horizontal = true;
          canvas.setPointerCapture(event.pointerId);
          canvas.style.cursor = "grabbing";
        } else drag.vertical = true;
      }
      if (drag.horizontal) {
        const next = clampRackRotation(
          drag.rotation + dx * 0.3,
          propsRef.current.mode,
        );
        targetRotation = (next * Math.PI) / 180;
        propsRef.current.onRotationChange(next);
        requestFrame();
      }
    };
    const pointerUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      const wasDragging =
        drag.horizontal ||
        drag.vertical ||
        Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >
          7;
      drag = null;
      canvas.style.cursor = "grab";
      if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
      if (wasDragging || event.type === "pointercancel") return;
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        (-(event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      scene.updateMatrixWorld(true);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(
        Array.from(clothes.values()).map(({ group }) => group),
        true,
      )[0];
      const id: unknown = hit?.object.userData.garmentId;
      if (typeof id === "string") propsRef.current.onSelect(id);
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      if (unavailable || disposed) return;
      unavailable = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      propsRef.current.onUnavailable();
    };
    const visibility = () => {
      if (document.hidden) {
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0;
      } else {
        lastTime = 0;
        requestFrame();
      }
    };
    canvas.addEventListener("pointerdown", pointerDown);
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp);
    window.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("webglcontextlost", contextLost);
    document.addEventListener("visibilitychange", visibility);
    update();
    resize();

    return () => {
      disposed = true;
      controllerRef.current = null;
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      intersection?.disconnect();
      canvas.removeEventListener("pointerdown", pointerDown);
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("webglcontextlost", contextLost);
      document.removeEventListener("visibilitychange", visibility);
      if (drag && canvas.hasPointerCapture(drag.id))
        canvas.releasePointerCapture(drag.id);
      disposeObject(scene);
      environment?.dispose();
      key.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.update();
  }, [
    props.items,
    props.mode,
    props.selectedId,
    props.rotation,
    props.zoom,
    props.light,
    props.reducedMotion,
    props.ariaLabel,
  ]);

  return (
    <div
      ref={hostRef}
      style={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        position: "absolute",
        inset: 0,
      }}
    />
  );
}
