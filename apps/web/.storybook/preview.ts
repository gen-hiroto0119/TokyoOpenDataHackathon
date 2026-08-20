import type { Preview } from "@storybook/react-vite";
import "../src/index.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
    viewport: {
      options: {
        phone390: {
          name: "390 × 844",
          styles: { width: "390px", height: "844px" },
        },
      },
    },
    backgrounds: {
      options: {
        work: { name: "surface/work", value: "#f8fafb" },
        shell: { name: "surface/shell", value: "#eef1f3" },
      },
    },
  },
  initialGlobals: {
    viewport: { value: "phone390", isRotated: false },
    backgrounds: { value: "work" },
  },
};

export default preview;
