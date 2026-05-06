/**
 * MyListScreen — Smart shopping list entry for Premium Concierge (Plan → Shop).
 * Reuses ListScreen UI/logic; route name `MyList` enables concierge behaviors.
 */
import ListScreen from './ListScreen';

export default function MyListScreen(props) {
  return <ListScreen {...props} />;
}
