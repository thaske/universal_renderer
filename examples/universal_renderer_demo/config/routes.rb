Rails.application.routes.draw do
  get "up" => "rails/health#show", :as => :rails_health_check
  root "home#index"
  get "*path",
      to: "home#index",
      constraints: ->(request) { request.format.html? && !request.xhr? }
end
