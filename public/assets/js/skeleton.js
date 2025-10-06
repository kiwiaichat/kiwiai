// Skeleton loader utilities

function createSkeletonCard() {
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton-card';
    skeleton.innerHTML = `
        <div class="skeleton skeleton-avatar"></div>
        <div class="skeleton skeleton-name"></div>
        <div class="skeleton skeleton-description"></div>
        <div class="skeleton skeleton-author"></div>
        <div class="skeleton skeleton-views"></div>
    `;
    return skeleton;
}

function showSkeletons(container, count = 6) {
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        container.appendChild(createSkeletonCard());
    }
}

function hideSkeletons(container) {
    container.innerHTML = '';
}
