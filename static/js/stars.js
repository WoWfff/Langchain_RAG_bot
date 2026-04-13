// Create animated stars
function createStars() {
    const starsContainer = document.createElement('div');
    starsContainer.id = 'stars-container';
    starsContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 0;
    `;
    document.body.insertBefore(starsContainer, document.body.firstChild);

    let activeStars = 0;
    const maxStars = 50;

    function createStar() {
        if (activeStars >= maxStars) return;
        
        activeStars++;
        const star = document.createElement('div');
        const size = Math.random() * 4 + 2;
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const duration = Math.random() * 10 + 8;
        const glowIntensity = size * 3;
        
        // Determine color based on theme
        const isLightTheme = document.body.getAttribute('data-theme') === 'light';
        const starColor = isLightTheme ? 'black' : 'white';
        const glowColor = isLightTheme ? '0, 0, 0' : '255, 255, 255';
        
        star.style.cssText = `
            position: absolute;
            left: ${x}%;
            top: ${y}%;
            width: ${size}px;
            height: ${size}px;
            background: ${starColor};
            border-radius: 50%;
            box-shadow: 0 0 ${glowIntensity}px rgba(${glowColor}, ${0.6 + size * 0.2}),
                        0 0 ${glowIntensity * 1.5}px rgba(${glowColor}, ${0.3 + size * 0.1});
            animation: twinkleStar ${duration}s ease-in-out 0s infinite;
            opacity: 0;
        `;
        
        starsContainer.appendChild(star);
        
        // Remove star after multiple animation cycles (3-5 cycles)
        const cycles = Math.floor(Math.random() * 3) + 3;
        setTimeout(() => {
            if (star.parentNode) {
                star.remove();
            }
            activeStars--;
            createStar();
        }, duration * cycles * 1000);
    }

    // Create stars immediately with minimal delay
    for (let i = 0; i < maxStars; i++) {
        setTimeout(() => createStar(), i * 100);
    }

    // Watch for theme changes and recreate all stars
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                // Remove all existing stars
                const container = document.getElementById('stars-container');
                if (container) {
                    container.remove();
                }
                activeStars = 0;
                // Recreate stars with new theme
                createStars();
            }
        });
    });

    observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['data-theme']
    });
}

// Create shooting stars
function createShootingStar() {
    const shootingStar = document.createElement('div');
    const startX = Math.random() * 100;
    const startY = Math.random() * 50; // Start from top half
    const angle = Math.random() * 30 + 30; // 30-60 degrees
    const duration = Math.random() * 1 + 0.5; // 0.5-1.5 seconds
    const size = Math.random() * 4 + 2; // 2-6px (bigger)
    
    // Determine color based on theme
    const isLightTheme = document.body.getAttribute('data-theme') === 'light';
    const starColor = isLightTheme ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 255, 255, 1)';
    const trailColor = isLightTheme ? '0, 0, 0' : '255, 255, 255';
    
    shootingStar.style.cssText = `
        position: fixed;
        left: ${startX}%;
        top: ${startY}%;
        width: ${size}px;
        height: ${size}px;
        background: ${starColor};
        border-radius: 50%;
        pointer-events: none;
        z-index: -1;
        box-shadow: 0 0 ${size * 6}px rgba(${trailColor}, 1),
                    -${size * 25}px -${size * 12}px ${size * 20}px rgba(${trailColor}, 0.5),
                    -${size * 50}px -${size * 25}px ${size * 15}px rgba(${trailColor}, 0.2);
        animation: shootingStar ${duration}s linear forwards;
        --angle: ${angle}deg;
    `;
    
    document.body.appendChild(shootingStar);
    
    setTimeout(() => {
        shootingStar.remove();
    }, duration * 1000);
}

// Create shooting stars at random intervals
function startShootingStars() {
    function scheduleNext() {
        const delay = Math.random() * 5000 + 3000; // 3-8 seconds between shooting stars
        const count = Math.floor(Math.random() * 3) + 1; // 1-3 shooting stars at once
        
        setTimeout(() => {
            for (let i = 0; i < count; i++) {
                setTimeout(() => createShootingStar(), i * 200); // Small delay between each
            }
            scheduleNext();
        }, delay);
    }
    scheduleNext();
}

const style = document.createElement('style');
style.textContent = `
    @keyframes twinkleStar {
        0%, 100% {
            opacity: 0;
            transform: scale(0);
        }
        50% {
            opacity: 1;
            transform: scale(1);
        }
    }
    
    @keyframes shootingStar {
        0% {
            opacity: 1;
            transform: translate(0, 0) rotate(var(--angle));
        }
        100% {
            opacity: 0;
            transform: translate(300px, 300px) rotate(var(--angle));
        }
    }
`;
document.head.appendChild(style);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        createStars();
        startShootingStars();
    });
} else {
    createStars();
    startShootingStars();
}
