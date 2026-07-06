import "./style.css";

const app = document.querySelector("#app");

app.innerHTML = `
  <section>
    <h1>Hello World</h1>
    <p>Hello from ${document.location.href}</p>
  </section>
`;
