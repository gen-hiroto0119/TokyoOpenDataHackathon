import type { Meta, StoryObj } from "@storybook/react-vite";
import { FieldSelect } from "./FieldSelect.js";
import { figma } from "../figma.js";

const options = [
  { value: "line.jr", label: "JR" },
  { value: "line.keio", label: "京王線" },
  { value: "line.marunouchi", label: "東京メトロ丸ノ内線" },
];

const meta = {
  title: "Field / Select",
  component: FieldSelect,
  argTypes: {
    Label: { control: "text" },
    Value: { control: "text" },
    assistiveText: { control: "text", name: "Assistive text" },
    showAssistive: { control: "boolean", name: "Show assistive" },
    Content: { control: "select", options: ["Empty", "Filled"] },
    State: { control: "select", options: ["Default", "Focus", "Error", "Disabled"] },
  },
  args: {
    Label: "到着する路線",
    Value: "路線を選ぶ",
    assistiveText: "例：東京都庁 展望室",
    showAssistive: true,
    Content: "Empty",
    State: "Default",
    options,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    design: { type: "figma", url: figma.fieldSelect },
  },
} satisfies Meta<typeof FieldSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Filled: Story = {
  args: {
    Content: "Filled",
    Value: "東京メトロ丸ノ内線",
  },
};

export const Error: Story = {
  args: { State: "Error" },
};

export const Disabled: Story = {
  args: { State: "Disabled" },
};
