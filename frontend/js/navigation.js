
document.addEventListener("DOMContentLoaded", () => {
    const links = document.querySelectorAll(
        ".sidebar nav a[data-section]"
    );

    const sections = document.querySelectorAll(".page-section");

    function showSection(id) {
        const target = document.getElementById(id);

        if (!target || !target.classList.contains("page-section")) {
            return;
        }

        sections.forEach(section => {
            section.hidden = section.id !== id;
        });

        links.forEach(link => {
            link.classList.toggle(
                "active",
                link.dataset.section === id
            );
        });

        history.replaceState(null, "", `#${id}`);
    }

    links.forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();
            showSection(link.dataset.section);
        });
    });

    showSection(location.hash.slice(1) || "dashboard");
});
