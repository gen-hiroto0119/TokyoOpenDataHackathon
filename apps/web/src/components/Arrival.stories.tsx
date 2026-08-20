import type { Meta, StoryObj } from "@storybook/react-vite";
import { Arrival } from "./Arrival.js";
import { figma } from "../figma.js";

const meta = {
  title: "Arrival",
  component: Arrival,
  argTypes: {
    Name: { control: "text" },
    Detail: { control: "text" },
    Initial: { control: "text" },
    Progress: { control: "select", options: ["Pending", "Moving", "Arrived", "OffPath"] },
    ShowReport: { control: "boolean" },
    Report: { control: "text" },
  },
  args: {
    Name: "かいる",
    Detail: "改札前",
    Initial: "か",
    Progress: "Pending",
    ShowReport: false,
    Report: "予定通り",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 358 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    design: { type: "figma", url: figma.arrival },
  },
} satisfies Meta<typeof Arrival>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {};

export const Moving: Story = {
  args: { Progress: "Moving", Detail: "丸ノ内線改札" },
};

export const Arrived: Story = {
  args: { Progress: "Arrived", Detail: "西口交番前" },
};

export const OffPath: Story = {
  args: { Progress: "OffPath" },
};

export const ReportShown: Story = {
  args: {
    Progress: "Arrived",
    Detail: "西口交番前",
    ShowReport: true,
    Report: "早く着く",
  },
};
