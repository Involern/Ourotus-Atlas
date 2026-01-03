/**
 * OUROTUS ATLAS - Celestial Rendering Module
 * Handles Three.js 3D rendering of planets, moons, stars, and space
 */

const CelestialRenderer = (function() {
    // Three.js objects
    let scene, camera, renderer, controls;
    let currentBody = null;
    let currentBodyId = null;
    let atmosphere = null;
    let cloudLayers = [];
    let gridOverlay = null;
    let starField = null;
    let nebulae = [];
    
    // State
    let isRotating = true;
    let showGrid = false;
    let showAtmosphere = true;
    let showLabels = false;
    
    // Container
    let container = null;
    
    /**
     * Initialize the 3D scene
     */
    function init(containerId) {
        container = document.getElementById(containerId);
        if (!container) {
            console.error('Container not found:', containerId);
            return false;
        }
        
        // Create scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x050508);
        
        // Create camera
        const aspect = container.clientWidth / container.clientHeight;
        camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 2000);
        camera.position.z = 12;
        
        // Create renderer
        renderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            alpha: true,
            powerPreference: 'high-performance'
        });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);
        
        // Create controls
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.minDistance = 4;
        controls.maxDistance = 50;
        controls.autoRotate = false;
        
        // Setup lighting
        setupLighting();
        
        // Create space background
        createSpaceBackground();
        
        // Handle resize
        window.addEventListener('resize', onResize);
        
        // Start render loop
        animate();
        
        return true;
    }
    
    /**
     * Setup scene lighting
     */
    function setupLighting() {
        // Ambient light for base illumination
        const ambientLight = new THREE.AmbientLight(0x202030, 0.3);
        scene.add(ambientLight);
        
        // Main directional light (sun)
        const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
        sunLight.position.set(15, 8, 10);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        scene.add(sunLight);
        
        // Secondary fill light
        const fillLight = new THREE.DirectionalLight(0x4060a0, 0.3);
        fillLight.position.set(-10, -5, -10);
        scene.add(fillLight);
        
        // Rim light for atmosphere glow
        const rimLight = new THREE.DirectionalLight(0x6080ff, 0.2);
        rimLight.position.set(0, 0, -15);
        scene.add(rimLight);
        
        // Hemisphere light for natural sky effect
        const hemiLight = new THREE.HemisphereLight(0x6080c0, 0x303050, 0.4);
        scene.add(hemiLight);
    }
    
    /**
     * Create realistic space background with stars and nebulae
     */
    function createSpaceBackground() {
        // Create multiple star layers for depth
        createStarLayer(15000, 0.8, 800);
        createStarLayer(8000, 1.2, 600);
        createStarLayer(3000, 2.0, 400);
        
        // Create distant nebulae
        createNebula(200, 150, 300, '#4a3080', 0.15);
        createNebula(-180, -100, 250, '#205060', 0.12);
        createNebula(100, -200, 350, '#803050', 0.1);
    }
    
    /**
     * Create a layer of stars
     */
    function createStarLayer(count, size, distance) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        
        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            
            // Distribute stars on a sphere
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1);
            const r = distance + (Math.random() - 0.5) * 100;
            
            positions[i3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i3 + 2] = r * Math.cos(phi);
            
            // Star colors - mostly white/blue, some yellow/red
            const colorType = Math.random();
            if (colorType > 0.95) {
                // Red giant
                colors[i3] = 1.0;
                colors[i3 + 1] = 0.6;
                colors[i3 + 2] = 0.4;
            } else if (colorType > 0.85) {
                // Yellow star
                colors[i3] = 1.0;
                colors[i3 + 1] = 0.95;
                colors[i3 + 2] = 0.8;
            } else if (colorType > 0.7) {
                // Blue star
                colors[i3] = 0.8;
                colors[i3 + 1] = 0.9;
                colors[i3 + 2] = 1.0;
            } else {
                // White star
                colors[i3] = 1.0;
                colors[i3 + 1] = 1.0;
                colors[i3 + 2] = 1.0;
            }
            
            // Vary star sizes
            sizes[i] = size * (0.5 + Math.random() * 0.8);
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        const material = new THREE.PointsMaterial({
            size: size,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            sizeAttenuation: true
        });
        
        const stars = new THREE.Points(geometry, material);
        scene.add(stars);
        starField = stars;
    }
    
    /**
     * Create a nebula cloud
     */
    function createNebula(x, y, z, color, opacity) {
        const geometry = new THREE.PlaneGeometry(300, 300);
        
        // Create nebula texture
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        // Draw nebula gradient
        const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.3, color + '80');
        gradient.addColorStop(0.7, color + '20');
        gradient.addColorStop(1, 'transparent');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 512, 512);
        
        // Add some noise/variation
        ctx.globalCompositeOperation = 'overlay';
        for (let i = 0; i < 50; i++) {
            const nx = Math.random() * 512;
            const ny = Math.random() * 512;
            const nr = Math.random() * 100 + 50;
            const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
            ng.addColorStop(0, 'rgba(255,255,255,0.1)');
            ng.addColorStop(1, 'transparent');
            ctx.fillStyle = ng;
            ctx.fillRect(0, 0, 512, 512);
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        const nebula = new THREE.Mesh(geometry, material);
        nebula.position.set(x, y, z);
        nebula.lookAt(0, 0, 0);
        scene.add(nebula);
        nebulae.push(nebula);
    }
    
    /**
     * Create a celestial body from data
     */
    function createCelestialBody(bodyData) {
        // Remove existing body
        if (currentBody) {
            scene.remove(currentBody);
            currentBody.geometry.dispose();
            currentBody.material.dispose();
        }
        
        // Remove existing atmosphere and clouds
        if (atmosphere) {
            scene.remove(atmosphere);
            atmosphere.geometry.dispose();
            atmosphere.material.dispose();
            atmosphere = null;
        }
        
        cloudLayers.forEach(cloud => {
            scene.remove(cloud);
            cloud.geometry.dispose();
            cloud.material.dispose();
        });
        cloudLayers = [];
        
        if (gridOverlay) {
            scene.remove(gridOverlay);
            gridOverlay.geometry.dispose();
            gridOverlay.material.dispose();
            gridOverlay = null;
        }
        
        // Create body based on type
        switch (bodyData.type) {
            case 'star':
                currentBody = createStar(bodyData);
                break;
            case 'gas-giant':
                currentBody = createGasGiant(bodyData);
                break;
            case 'asteroid':
                currentBody = createAsteroid(bodyData);
                break;
            default:
                currentBody = createPlanetOrMoon(bodyData);
        }
        
        currentBodyId = bodyData.id;
        scene.add(currentBody);
        
        // Create atmosphere if enabled
        if (bodyData.atmosphere && bodyData.atmosphere.enabled) {
            createAtmosphere(bodyData);
        }
        
        // Create grid overlay
        createGrid(bodyData.radius);
        
        return currentBody;
    }
    
    /**
     * Create a planet or moon
     */
    function createPlanetOrMoon(data) {
        const geometry = new THREE.SphereGeometry(data.radius, 128, 128);
        
        // Generate planet texture
        const texture = generatePlanetTexture(data);
        
        const material = new THREE.MeshPhongMaterial({
            map: texture,
            shininess: 10,
            bumpScale: 0.03
        });
        
        // Use custom texture if provided
        if (data.texture) {
            const loader = new THREE.TextureLoader();
            loader.load(data.texture, (tex) => {
                material.map = tex;
                material.needsUpdate = true;
            });
        }
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { rotationSpeed: data.rotationSpeed };
        
        return mesh;
    }
    
    /**
     * Generate procedural planet texture
     */
    function generatePlanetTexture(data) {
        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        
        // Base ocean color
        ctx.fillStyle = data.colors.primary;
        ctx.fillRect(0, 0, 2048, 1024);
        
        // Add ocean texture variation
        addNoisePattern(ctx, data.colors.primary, 0.3, 500);
        
        // Draw biomes
        if (data.biomes && data.biomes.length > 0) {
            data.biomes.forEach(biome => {
                drawBiome(ctx, biome, data);
            });
        } else {
            // Default biome distribution
            drawDefaultBiomes(ctx, data);
        }
        
        // Draw polar ice caps
        drawPolarCaps(ctx, data.colors.polar);
        
        return new THREE.CanvasTexture(canvas);
    }
    
    /**
     * Add noise pattern to canvas
     */
    function addNoisePattern(ctx, baseColor, intensity, count) {
        // Parse the base color
        const r = parseInt(baseColor.slice(1, 3), 16);
        const g = parseInt(baseColor.slice(3, 5), 16);
        const b = parseInt(baseColor.slice(5, 7), 16);
        
        ctx.fillStyle = `rgba(${Math.min(255, r + 30)}, ${Math.min(255, g + 30)}, ${Math.min(255, b + 30)}, ${intensity})`;
        
        for (let i = 0; i < count; i++) {
            const x = Math.random() * 2048;
            const y = Math.random() * 1024;
            const radius = Math.random() * 20 + 5;
            
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    /**
     * Draw a biome on the texture
     */
    function drawBiome(ctx, biome, data) {
        const x = biome.x * 2048;
        const y = biome.y * 1024;
        const width = (biome.width || 0.15) * 2048;
        const height = (biome.height || 0.12) * 1024;
        
        // Main biome shape
        ctx.fillStyle = biome.color;
        ctx.beginPath();
        ctx.ellipse(x, y, width, height, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Add texture
        addNoisePattern(ctx, biome.color, 0.4, 30);
    }
    
    /**
     * Draw default biomes
     */
    function drawDefaultBiomes(ctx, data) {
        // Forest/green areas
        ctx.fillStyle = data.colors.secondary;
        drawLandmass(ctx, 1200, 300, 360, 260);
        drawLandmass(ctx, 200, 700, 240, 180);
        
        // Desert/accent areas
        ctx.fillStyle = data.colors.accent;
        drawLandmass(ctx, 1600, 700, 280, 200);
        drawLandmass(ctx, 400, 200, 300, 240);
        
        // Additional variation
        ctx.fillStyle = data.colors.secondary;
        drawLandmass(ctx, 800, 600, 320, 220);
    }
    
    /**
     * Draw a landmass shape
     */
    function drawLandmass(ctx, x, y, width, height) {
        ctx.beginPath();
        ctx.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Add some edge variation
        const edgeColor = ctx.fillStyle;
        ctx.fillStyle = adjustColor(edgeColor, -20);
        
        for (let i = 0; i < 20; i++) {
            const dotX = x + (Math.random() - 0.5) * width * 0.8;
            const dotY = y + (Math.random() - 0.5) * height * 0.8;
            const radius = Math.random() * 10 + 3;
            
            ctx.beginPath();
            ctx.arc(dotX, dotY, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    /**
     * Draw polar ice caps
     */
    function drawPolarCaps(ctx, color) {
        ctx.fillStyle = color;
        
        // North pole
        ctx.fillRect(0, 0, 2048, 100);
        
        // South pole
        ctx.fillRect(0, 924, 2048, 100);
        
        // Add texture
        ctx.fillStyle = adjustColor(color, -15);
        for (let i = 0; i < 80; i++) {
            const x = Math.random() * 2048;
            const y = Math.random() < 0.5 ? Math.random() * 100 : 924 + Math.random() * 100;
            const r = Math.random() * 15 + 5;
            
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    /**
     * Adjust color brightness
     */
    function adjustColor(color, amount) {
        const hex = color.replace('#', '');
        const r = Math.max(0, Math.min(255, parseInt(hex.slice(0, 2), 16) + amount));
        const g = Math.max(0, Math.min(255, parseInt(hex.slice(2, 4), 16) + amount));
        const b = Math.max(0, Math.min(255, parseInt(hex.slice(4, 6), 16) + amount));
        return `rgb(${r}, ${g}, ${b})`;
    }
    
    /**
     * Create a star
     */
    function createStar(data) {
        const geometry = new THREE.SphereGeometry(data.radius, 64, 64);
        
        // Create glowing star material
        const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(data.colors.primary),
            emissive: new THREE.Color(data.colors.primary),
            emissiveIntensity: 1
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { rotationSpeed: data.rotationSpeed };
        
        // Add glow effect
        const glowGeometry = new THREE.SphereGeometry(data.radius * 1.2, 32, 32);
        const glowMaterial = new THREE.ShaderMaterial({
            uniforms: {
                color: { value: new THREE.Color(data.colors.accent) }
            },
            vertexShader: `
                varying vec3 vNormal;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 color;
                varying vec3 vNormal;
                void main() {
                    float intensity = pow(0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
                    gl_FragColor = vec4(color, 1.0) * intensity;
                }
            `,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            transparent: true
        });
        
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        mesh.add(glow);
        
        return mesh;
    }
    
    /**
     * Create a gas giant
     */
    function createGasGiant(data) {
        const geometry = new THREE.SphereGeometry(data.radius, 128, 128);
        
        // Generate banded texture for gas giant
        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        
        // Create horizontal bands
        const bands = 20;
        for (let i = 0; i < bands; i++) {
            const y = (i / bands) * 1024;
            const height = 1024 / bands;
            const colorIndex = i % 3;
            const colors = [data.colors.primary, data.colors.secondary, data.colors.accent];
            
            ctx.fillStyle = colors[colorIndex];
            ctx.fillRect(0, y, 2048, height);
            
            // Add turbulence
            addNoisePattern(ctx, colors[colorIndex], 0.3, 50);
        }
        
        // Add storm spots
        ctx.fillStyle = data.colors.accent;
        ctx.beginPath();
        ctx.ellipse(500, 400, 100, 60, 0, 0, Math.PI * 2);
        ctx.fill();
        
        const texture = new THREE.CanvasTexture(canvas);
        
        const material = new THREE.MeshPhongMaterial({
            map: texture,
            shininess: 5
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.userData = { rotationSpeed: data.rotationSpeed };
        
        return mesh;
    }
    
    /**
     * Create an asteroid
     */
    function createAsteroid(data) {
        // Create irregular geometry
        const geometry = new THREE.IcosahedronGeometry(data.radius, 2);
        
        // Distort vertices for irregular shape
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);
            
            const noise = 0.8 + Math.random() * 0.4;
            positions.setXYZ(i, x * noise, y * noise, z * noise);
        }
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshPhongMaterial({
            color: new THREE.Color(data.colors.primary),
            shininess: 2,
            flatShading: true
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { rotationSpeed: data.rotationSpeed };
        
        return mesh;
    }
    
    /**
     * Create atmosphere around celestial body
     */
    function createAtmosphere(data) {
        if (!data.atmosphere || !data.atmosphere.enabled) return;
        
        // Inner atmosphere glow
        const innerGeometry = new THREE.SphereGeometry(data.radius * 1.02, 64, 64);
        const innerMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color(data.atmosphere.color),
            transparent: true,
            opacity: data.atmosphere.opacity * 0.3,
            side: THREE.BackSide
        });
        
        const innerAtmo = new THREE.Mesh(innerGeometry, innerMaterial);
        scene.add(innerAtmo);
        atmosphere = innerAtmo;
        
        // Create cloud layers
        createCloudLayers(data);
    }
    
    /**
     * Create realistic cloud layers
     */
    function createCloudLayers(data) {
        // Layer 1: Main cloud cover
        const cloud1 = createCloudLayer(data.radius * 1.03, 0.6, 0.003);
        scene.add(cloud1);
        cloudLayers.push(cloud1);
        
        // Layer 2: High altitude wisps
        const cloud2 = createCloudLayer(data.radius * 1.05, 0.4, 0.004);
        cloud2.rotation.x = 0.2;
        scene.add(cloud2);
        cloudLayers.push(cloud2);
    }
    
    /**
     * Create a single cloud layer
     */
    function createCloudLayer(radius, opacity, rotationSpeed) {
        const geometry = new THREE.SphereGeometry(radius, 64, 64);
        
        // Generate cloud texture
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        // Clear to transparent
        ctx.clearRect(0, 0, 1024, 512);
        
        // Draw cloud clusters
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        
        for (let i = 0; i < 30; i++) {
            const cx = Math.random() * 1024;
            const cy = 100 + Math.random() * 312; // Avoid poles
            const size = 30 + Math.random() * 80;
            
            // Draw cloud puff
            for (let j = 0; j < 8; j++) {
                const px = cx + (Math.random() - 0.5) * size;
                const py = cy + (Math.random() - 0.5) * size * 0.5;
                const pr = size * (0.3 + Math.random() * 0.3);
                
                ctx.beginPath();
                ctx.arc(px, py, pr, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { rotationSpeed };
        
        return mesh;
    }
    
    /**
     * Create grid overlay
     */
    function createGrid(radius) {
        const geometry = new THREE.SphereGeometry(radius * 1.01, 36, 18);
        const material = new THREE.MeshBasicMaterial({
            color: 0x666666,
            wireframe: true,
            transparent: true,
            opacity: 0.3
        });
        
        gridOverlay = new THREE.Mesh(geometry, material);
        gridOverlay.visible = showGrid;
        scene.add(gridOverlay);
    }
    
    /**
     * Animation loop
     */
    function animate() {
        requestAnimationFrame(animate);
        
        // Rotate celestial body
        if (isRotating && currentBody) {
            const speed = currentBody.userData.rotationSpeed || 0.002;
            currentBody.rotation.y += speed;
            
            // Rotate grid with body
            if (gridOverlay) {
                gridOverlay.rotation.y += speed;
            }
            
            // Rotate atmosphere at slightly different speed
            if (atmosphere) {
                atmosphere.rotation.y += speed * 0.8;
            }
            
            // Rotate cloud layers at different speeds
            cloudLayers.forEach((cloud, index) => {
                cloud.rotation.y += (cloud.userData.rotationSpeed || 0.003);
            });
        }
        
        // Update controls
        controls.update();
        
        // Render
        renderer.render(scene, camera);
    }
    
    /**
     * Handle window resize
     */
    function onResize() {
        if (!container || !camera || !renderer) return;
        
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }
    
    /**
     * Update custom texture
     */
    function setCustomTexture(textureUrl) {
        if (!currentBody) return;
        
        const loader = new THREE.TextureLoader();
        loader.load(textureUrl, (texture) => {
            currentBody.material.map = texture;
            currentBody.material.needsUpdate = true;
        });
    }
    
    // Public API
    return {
        init,
        
        /**
         * Load a celestial body
         */
        loadCelestialBody(bodyData) {
            return createCelestialBody(bodyData);
        },
        
        /**
         * Get current body ID
         */
        getCurrentBodyId() {
            return currentBodyId;
        },
        
        /**
         * Toggle rotation
         */
        toggleRotation() {
            isRotating = !isRotating;
            return isRotating;
        },
        
        /**
         * Set rotation state
         */
        setRotation(state) {
            isRotating = state;
        },
        
        /**
         * Toggle grid visibility
         */
        toggleGrid() {
            showGrid = !showGrid;
            if (gridOverlay) {
                gridOverlay.visible = showGrid;
            }
            return showGrid;
        },
        
        /**
         * Set grid visibility
         */
        setGrid(state) {
            showGrid = state;
            if (gridOverlay) {
                gridOverlay.visible = state;
            }
        },
        
        /**
         * Toggle atmosphere/clouds visibility
         */
        toggleAtmosphere() {
            showAtmosphere = !showAtmosphere;
            if (atmosphere) {
                atmosphere.visible = showAtmosphere;
            }
            cloudLayers.forEach(cloud => {
                cloud.visible = showAtmosphere;
            });
            return showAtmosphere;
        },
        
        /**
         * Set atmosphere visibility
         */
        setAtmosphere(state) {
            showAtmosphere = state;
            if (atmosphere) {
                atmosphere.visible = state;
            }
            cloudLayers.forEach(cloud => {
                cloud.visible = state;
            });
        },
        
        /**
         * Toggle labels
         */
        toggleLabels() {
            showLabels = !showLabels;
            return showLabels;
        },
        
        /**
         * Zoom in
         */
        zoomIn() {
            if (controls) {
                const direction = new THREE.Vector3();
                camera.getWorldDirection(direction);
                camera.position.addScaledVector(direction, 2);
            }
        },
        
        /**
         * Zoom out
         */
        zoomOut() {
            if (controls) {
                const direction = new THREE.Vector3();
                camera.getWorldDirection(direction);
                camera.position.addScaledVector(direction, -2);
            }
        },
        
        /**
         * Reset view
         */
        resetView() {
            if (controls) {
                controls.reset();
                camera.position.set(0, 0, 12);
                camera.lookAt(0, 0, 0);
            }
        },
        
        /**
         * Set custom texture from file
         */
        setCustomTexture,
        
        /**
         * Dispose of all resources
         */
        dispose() {
            window.removeEventListener('resize', onResize);
            
            if (renderer) {
                renderer.dispose();
            }
            
            if (currentBody) {
                currentBody.geometry.dispose();
                currentBody.material.dispose();
            }
            
            // Clean up other objects...
        }
    };
})();

// Make available globally
window.CelestialRenderer = CelestialRenderer;
