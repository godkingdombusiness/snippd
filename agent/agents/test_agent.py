from agent.agents.adk_architect import StackArchitect

agent = StackArchitect()
agent.set_up()

result = agent.query("Find today’s best Publix stacks for Florida")
print(result)