"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  applyAvatarPose,
  applyAvatarWardrobe,
  disposeAvatarObject,
  normalizeAvatarModel,
  normalizedAvatarRotation,
  safeAvatarZoom,
} from "./scene-model";
import type { AvatarSceneProps } from "./scene-types";
import { avatarSceneUrl, avatarSceneIdentity } from "@/lib/avatar-editorial";

import { recordAvatarTurntable } from "@/lib/avatar-turntable";

type SceneController = { update: () => void; };

/** Local meshes and embedded textures only: no personal photo enters this renderer. */
export default function AvatarScene(props: AvatarSceneProps) {
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
        alpha: true,
        powerPreference: "default",
      });
    } catch {
      propsRef.current.onError("webgl");
      return;
    }
    let disposed = false;
    let unavailable = false;
    let frame = 0;
    let lastTime = 0;
    let visible = true;
    let lastRotationPublish = 0;
    let loadedModel: string | null = null;
    let loadVersion = 0;
    let pendingLoad: AbortController | null = null;
    let avatar: THREE.Group | null = null;
    let ready = false;
    let modelLoading = false;
    let recording: AbortController | null = null;
    let lastReceivedRotation = propsRef.current.config.rotation;
    let targetRotation = THREE.MathUtils.degToRad(
      normalizedAvatarRotation(lastReceivedRotation),
    );
    let targetZoom = safeAvatarZoom(propsRef.current.config.zoom);
    let zoom = targetZoom;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    const turntable = new THREE.Group();
    turntable.rotation.y = targetRotation;
    scene.add(turntable);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const canvas = renderer.domElement;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", propsRef.current.ariaLabel);
    canvas.style.cssText =
      "display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab";
    host.appendChild(canvas);

    const ambient = new THREE.HemisphereLight("#ffffff", "#bcb4b0", 0.82);
    const key = new THREE.DirectionalLight("#fff4ec", 2.2);
    key.position.set(-3.5, 6.5, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -2;
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 18;
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.015;
    const fill = new THREE.DirectionalLight("#e3ecff", 0.75);
    fill.position.set(4.5, 3, 4);
    const rim = new THREE.DirectionalLight("#fff8ed", 1.4);
    rim.position.set(-1, 4.5, -3.5);
    scene.add(ambient, key, fill, rim);

    const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.13 });
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      floorMaterial,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.025;
    floor.receiveShadow = true;
    scene.add(floor);
    const podium = new THREE.Mesh(
      new THREE.CylinderGeometry(1.12, 1.16, 0.055, 96),
      new THREE.MeshStandardMaterial({
        color: "#ebe7e1",
        roughness: 0.73,
        metalness: 0.04,
      }),
    );
    podium.position.y = -0.029;
    podium.receiveShadow = true;
    scene.add(podium);

    const environmentScene = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    let environment: THREE.WebGLRenderTarget | null = null;
    try {
      environment = pmrem.fromScene(environmentScene, 0.035);
      scene.environment = environment.texture;
      scene.environmentIntensity = 0.28;
    } catch {
      // Explicit studio lights remain available when the optional reflection map fails.
    } finally {
      environmentScene.dispose();
      pmrem.dispose();
    }

    const updateCamera = () => {
      const aspect =
        Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight);
      camera.aspect = aspect;
      // Frame the complete head-to-shoe silhouette even in a narrow phone viewport.
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
      const portrait = propsRef.current.framing === "portrait";
      const distance = Math.max(
        (portrait ? 0.75 : 1.9) / Math.tan(verticalFov / 2),
        (portrait ? 0.38 : 1.05) / Math.tan(horizontalFov / 2),
      );
      // Portrait changes the camera target, keeping authored facial geometry intact.
      camera.position.set(0, portrait ? 2.72 : 1.68 + 0.12 / zoom, distance / zoom);
      camera.lookAt(0, portrait ? 2.68 : 1.61, 0);
      camera.updateProjectionMatrix();
    };
    const stopFrame = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
    };
    const requestFrame = () => {
      if (disposed || unavailable || recording || frame || (!visible && ready) || document.hidden)
        return;
      frame = window.requestAnimationFrame(render);
    };
    const publishRotation = () => {
      const value = normalizedAvatarRotation(
        THREE.MathUtils.radToDeg(targetRotation),
      );
      lastReceivedRotation = value;
      propsRef.current.onRotationChange(value);
    };
    const render = (now: number) => {
      frame = 0;
      if (disposed || unavailable || (!visible && ready) || document.hidden) return;
      const elapsed = lastTime ? Math.min(50, now - lastTime) : 16;
      lastTime = now;
      const current = propsRef.current;
      const rotating = Boolean(
        avatar && current.autoRotate && !current.reducedMotion && !drag,
      );
      if (rotating) {
        targetRotation += THREE.MathUtils.degToRad(elapsed * 0.009);
        if (now - lastRotationPublish > 180) {
          lastRotationPublish = now;
          publishRotation();
        }
      }
      const factor = current.reducedMotion ? 1 : 1 - Math.exp(-elapsed / 85);
      const rotatingToTarget =
        Math.abs(turntable.rotation.y - targetRotation) > 0.0005;
      const zooming = Math.abs(zoom - targetZoom) > 0.0005;
      turntable.rotation.y = rotatingToTarget
        ? THREE.MathUtils.lerp(turntable.rotation.y, targetRotation, factor)
        : targetRotation;
      zoom = zooming
        ? THREE.MathUtils.lerp(zoom, targetZoom, factor)
        : targetZoom;
      updateCamera();
      try {
        renderer.render(scene, camera);
        if (avatar && !ready && !modelLoading) {
          ready = true;
          propsRef.current.onReady();
        }
      } catch {
        unavailable = true;
        propsRef.current.onController(null);
        propsRef.current.onError("webgl");
      }
      if (rotating || rotatingToTarget || zooming) requestFrame();
    };

    const capture = async (options?: {
      reportError?: boolean;
    }): Promise<Blob> => {
      if (disposed || unavailable || recording || !avatar || !ready || modelLoading) {
        if (options?.reportError !== false) propsRef.current.onError("export");
        throw new Error("Avatar is not ready for capture");
      }
      try {
        // Render and copy synchronously; preserveDrawingBuffer is not needed for normal frames.
        renderer.render(scene, camera);
        const copy = document.createElement("canvas");
        copy.width = canvas.width;
        copy.height = canvas.height;
        const context = copy.getContext("2d");
        if (!context) throw new Error("Image context unavailable");
        const light = propsRef.current.config.light;
        context.fillStyle =
          light === "night"
            ? "#272b3d"
            : light === "warm"
              ? "#e6d4c0"
              : "#eeebe8";
        context.fillRect(0, 0, copy.width, copy.height);
        context.drawImage(canvas, 0, 0);
        return await new Promise<Blob>((resolve, reject) => {
          copy.toBlob((blob) => {
            copy.width = 0;
            copy.height = 0;
            if (!blob || disposed || unavailable)
              reject(new Error("Image export unavailable"));
            else resolve(blob);
          }, "image/png");
        });
      } catch (error) {
        if (!disposed && options?.reportError !== false)
          propsRef.current.onError("export");
        throw error;
      }
    };

    const captureTurntable = async () => {
      if (disposed || unavailable || recording || !avatar || !ready || modelLoading || document.hidden)
        throw new Error("Avatar is not ready for video");
      const abort = new AbortController();
      recording = abort;
      stopFrame();
      const initialRotation = turntable.rotation.y;
      const initialBackground = scene.background;
      const light = propsRef.current.config.light;
      scene.background = new THREE.Color(light === "night" ? "#272b3d" : light === "warm" ? "#e6d4c0" : "#eeebe8");
      try {
        return await recordAvatarTurntable(canvas, progress => {
          if (disposed || unavailable || modelLoading) throw new Error("Avatar video interrupted");
          turntable.rotation.y = initialRotation + progress * Math.PI * 2;
          renderer.render(scene, camera);
        }, abort.signal);
      } finally {
        if (recording === abort) recording = null;
        if (!disposed) {
          turntable.rotation.y = initialRotation;
          scene.background = initialBackground;
          requestFrame();
        }
      }
    };

    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      if (url.startsWith("blob:") || url.startsWith("data:")) return url;
      throw new Error("Avatar assets must contain embedded resources");
    });
    const loader = new GLTFLoader(manager);
    const loadModel = async (config: AvatarSceneProps["config"]) => {
      pendingLoad?.abort();
      const abort = new AbortController();
      pendingLoad = abort;
      const version = ++loadVersion;
      ready = false;
      modelLoading = true;
      propsRef.current.onController(null);
      let parsed: THREE.Object3D | null = null;
      try {
        const compact = config.renderMode === "editorial" && (
          window.matchMedia("(max-width: 600px)").matches ||
          renderer.capabilities.maxTextureSize < (config.editorialLook === "refined" || config.editorialLook === "dopamine" ? 8192 : 4096)
        );
        const response = await fetch(avatarSceneUrl(config, compact), {
          signal: abort.signal,
          credentials: "omit",
        });
        if (!response.ok) throw new Error("Avatar asset unavailable");
        const data = await response.arrayBuffer();
        if (disposed || version !== loadVersion) return;
        const gltf = await loader.parseAsync(data, "");
        parsed = gltf.scene;
        if (disposed || abort.signal.aborted || version !== loadVersion) {
          disposeAvatarObject(parsed);
          return;
        }
        const replacement = normalizeAvatarModel(parsed);
        replacement.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = true;
          object.receiveShadow = true;
        });
        const current = propsRef.current;
        if (current.config.renderMode !== "editorial") applyAvatarWardrobe(
          replacement,
          current.config.palette,
          current.dressMode,
          current.showOuterwear,
          current.config.garments,
        );
        if (current.config.renderMode !== "editorial") applyAvatarPose(replacement, current.config.pose);
        // Swap only after the complete, clothed replacement has been prepared.
        if (avatar) {
          turntable.remove(avatar);
          disposeAvatarObject(avatar);
        }
        avatar = replacement;
        turntable.add(replacement);
        parsed = null;
        modelLoading = false;
        propsRef.current.onController({ capture, captureTurntable });
        requestFrame();
      } catch {
        if (parsed) disposeAvatarObject(parsed);
        if (disposed || abort.signal.aborted || version !== loadVersion) return;
        propsRef.current.onError("model");
      }
    };

    const update = () => {
      if (disposed || unavailable) return;
      const current = propsRef.current;
      const { config } = current;
      if (recording) {
        if (loadedModel !== avatarSceneIdentity(config)) recording.abort();
        else return;
      }
      canvas.setAttribute("aria-label", current.ariaLabel);
      if (config.rotation !== lastReceivedRotation) {
        lastReceivedRotation = config.rotation;
        const currentDegrees = normalizedAvatarRotation(
          THREE.MathUtils.radToDeg(targetRotation),
        );
        const nextDegrees = normalizedAvatarRotation(config.rotation);
        const delta = ((nextDegrees - currentDegrees + 540) % 360) - 180;
        targetRotation += THREE.MathUtils.degToRad(delta);
      }
      targetZoom = safeAvatarZoom(config.zoom);
      if (loadedModel !== avatarSceneIdentity(config)) {
        loadedModel = avatarSceneIdentity(config);
        void loadModel(config);
      }
      if (avatar) {
        if (config.renderMode !== "editorial") applyAvatarWardrobe(
          avatar,
          config.palette,
          current.dressMode,
          current.showOuterwear,
          config.garments,
        );
        if (config.renderMode !== "editorial") applyAvatarPose(avatar, config.pose);
      }
      const night = config.light === "night";
      const warm = config.light === "warm";
      // Transparent studio surrounds preserve the page's depth and brand behind the real mesh.
      // Exports explicitly fill an opaque background before copying the rendered canvas.
      scene.background = null;
      floorMaterial.opacity = night ? 0.2 : 0.13;
      (podium.material as THREE.MeshStandardMaterial).color.set(
        night ? "#34394f" : warm ? "#e3d1bd" : "#ebe7e1",
      );
      key.color.set(warm ? "#ffdcac" : "#fff6f0");
      key.intensity = night ? 2.5 : 2.2;
      fill.color.set(night ? "#adbeff" : "#e3ecff");
      fill.intensity = night ? 1.15 : 0.75;
      rim.color.set(night ? "#d7b8fc" : "#fff8ed");
      ambient.intensity = night ? 0.4 : 0.82;
      renderer.toneMappingExposure = night ? 0.86 : 0.95;
      requestFrame();
    };
    controllerRef.current = { update };

    const resize = () => {
      if (disposed || unavailable) return;
      recording?.abort();
      renderer.setSize(
        Math.max(1, host.clientWidth),
        Math.max(1, host.clientHeight),
        false,
      );
      updateCamera();
      requestFrame();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    const intersection =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
          visible = entries[0]?.isIntersecting ?? true;
          // A newly loaded model needs one real frame to initialize GPU textures
          // and enable export, even when its saved-look control is below the fold.
          if (visible || !ready) requestFrame();
          else stopFrame();
        });
    intersection?.observe(host);
    let drag: {
      id: number;
      startX: number;
      startY: number;
      startRotation: number;
      horizontal: boolean;
      vertical: boolean;
    } | null = null;
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || drag || unavailable || recording) return;
      drag = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startRotation: targetRotation,
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
      if (!drag.horizontal) return;
      targetRotation = drag.startRotation + THREE.MathUtils.degToRad(dx * 0.4);
      publishRotation();
      requestFrame();
    };
    const pointerUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      drag = null;
      canvas.style.cursor = "grab";
      if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
      requestFrame();
    };
    const wheel = (event: WheelEvent) => {
      if (unavailable || recording || !Number.isFinite(event.deltaY)) return;
      const multiplier =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? host.clientHeight
            : 1;
      const next = safeAvatarZoom(
        targetZoom - event.deltaY * multiplier * 0.0015,
      );
      if (next === targetZoom) return;
      event.preventDefault();
      targetZoom = next;
      propsRef.current.onZoomChange(next);
      requestFrame();
    };
    const visibility = () => {
      if (document.hidden) { recording?.abort(); stopFrame(); }
      else requestFrame();
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      if (disposed || unavailable) return;
      unavailable = true;
      recording?.abort();
      pendingLoad?.abort();
      ++loadVersion;
      stopFrame();
      propsRef.current.onController(null);
      propsRef.current.onError("webgl");
    };
    canvas.addEventListener("pointerdown", pointerDown);
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp);
    window.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("webglcontextlost", contextLost);
    document.addEventListener("visibilitychange", visibility);
    update();
    resize();

    return () => {
      disposed = true;
      recording?.abort();
      ++loadVersion;
      pendingLoad?.abort();
      controllerRef.current = null;
      propsRef.current.onController(null);
      stopFrame();
      observer.disconnect();
      intersection?.disconnect();
      canvas.removeEventListener("pointerdown", pointerDown);
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("webglcontextlost", contextLost);
      document.removeEventListener("visibilitychange", visibility);
      if (drag && canvas.hasPointerCapture(drag.id))
        canvas.releasePointerCapture(drag.id);
      disposeAvatarObject(scene);
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
    props.config,
    props.framing,
    props.dressMode,
    props.showOuterwear,
    props.autoRotate,
    props.reducedMotion,
    props.ariaLabel,
  ]);

  return (
    <div
      ref={hostRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        minWidth: 0,
      }}
    />
  );
}
