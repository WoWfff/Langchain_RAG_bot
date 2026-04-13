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
        
        star.style.cssText = `
            position: absolute;
            left: ${x}%;
            top: ${y}%;
            width: ${size}px;
            height: ${size}px;
            background: white;
            border-radius: 50%;
            box-shadow: 0 0 ${glowIntensity}px rgba(255, 255, 255, ${0.6 + size * 0.2}),
                        0 0 ${glowIntensity * 1.5}px rgba(255, 255, 255, ${0.3 + size * 0.1});
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
`;
document.head.appendChild(style);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createStars);
} else {
    createStars();
}
