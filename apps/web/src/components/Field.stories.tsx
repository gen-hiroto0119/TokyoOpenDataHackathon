import type { Meta, StoryObj } from "@storybook/react-vite";
import { Field } from "./Field.js";
import { figma } from "../figma.js";

const meta = {
  title: "Field / Text",
  component: Field,
  argTypes: {
    Label: { control: "text" },
    Value: { control: "text" },
    assistiveText: { control: "text", name: "Assistive text" },
    showAssistive: { control: "boolean", name: "Show assistive" },
    Content: { control: "select", options: ["Empty", "Filled"] },
    State: { control: "select", options: ["Default", "Focus", "Error", "Disabled"] },
  },
  args: {
    Label: "目的地",
    Value: "駅・施設名を入力",
    assistiveText: "例：東京都庁 展望室",
    showAssistive: true,
    Content: "Empty",
    State: "Default",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    design: { type: "figma", url: figma.field },
  },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Filled: Story = {
  args: {
    Content: "Filled",
    Value: "東京都庁",
  },
};

export const Error: Story = {
  args: { State: "Error" },
};

export const Disabled: Story = {
  args: { State: "Disabled" },
};
