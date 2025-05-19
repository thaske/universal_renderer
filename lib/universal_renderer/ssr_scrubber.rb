require "loofah"

module UniversalRenderer
  class SsrScrubber < ::Loofah::Scrubber
    def initialize
      super
      @direction = :top_down
    end

    def scrub(node)
      # Primary actions: stop if script, continue if a passthrough tag, otherwise clean attributes.
      return Loofah::Scrubber::STOP if handle_script_node(node) # Checks for <script> and removes it

      # Allows <link rel="stylesheet">, <style>, <meta> to pass through this scrubber.
      return Loofah::Scrubber::CONTINUE if passthrough_node?(node)

      # For all other nodes, clean potentially harmful attributes.
      clean_attributes(node)
      # Default Loofah behavior (CONTINUE for children) applies if not returned earlier.
    end

    private

    # Handles <script> tags: removes them and returns true if a script node was processed.
    def handle_script_node(node)
      return false unless node.name == "script"

      node.remove
      true # Indicates the node was a script and has been handled.
    end

    # Checks if the node is a type that should bypass detailed attribute scrubbing.
    def passthrough_node?(node)
      (node.name == "link" && node["rel"]&.to_s&.downcase == "stylesheet") ||
        %w[style meta].include?(node.name)
    end

    # Orchestrates the cleaning of attributes for a given node.
    def clean_attributes(node)
      remove_javascript_href(node)
      remove_event_handlers(node)
    end

    # Removes "javascript:" hrefs from <a> tags.
    def remove_javascript_href(node)
      if node.name == "a" &&
           node["href"]&.to_s&.downcase&.start_with?("javascript:")
        node.remove_attribute("href")
      end
    end

    # Removes "on*" event handler attributes from any node.
    def remove_event_handlers(node)
      attrs_to_remove =
        node.attributes.keys.select do |name|
          name.to_s.downcase.start_with?("on")
        end
      attrs_to_remove.each { |attr_name| node.remove_attribute(attr_name) }
    end
  end
end
