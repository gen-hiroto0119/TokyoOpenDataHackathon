import type { Meta, StoryObj } from "@storybook/react-vite";
import { Candidate } from "./Candidate.js";
import { figma } from "../figma.js";

const meta = {
  title: "Candidate",
  component: Candidate,
  argTypes: {
    Name: { control: "text" },
    Floor: { control: "text" },
    Reason: { control: "text" },
    Facts: { control: "text" },
    ShowElevator: { control: "boolean" },
    ShowRestroom: { control: "boolean" },
    ShowStepFree: { control: "boolean" },
    State: { control: "select", options: ["Default", "Selected"] },
    Action: { control: "select", options: ["Shown", "Hidden"] },
  },
  args: {
    Name: "B1 案内板前",
    Floor: "B1",
    Reason: "集合後は都庁方面へ歩く",
    Facts: "出口まで 3分",
    ShowElevator: true,
    ShowRestroom: true,
    ShowStepFree: true,
    State: "Default",
    Action: "Shown",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 358 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    design: { type: "figma", url: figma.candidate },
  },
} satisfies Meta<typeof Candidate>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = {
  args: { State: "Selected" },
};

export const ActionHidden: Story = {
  args: { Action: "Hidden" },
};

export const SelectedHidden: Story = {
  args: { State: "Selected", Action: "Hidden" },
};
